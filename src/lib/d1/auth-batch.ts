import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { HttpError } from "../http";
import models from "../../../cloudflare/d1/auth-models.json";
import type { D1Statement, D1Value } from "./atomic";
import { guardedD1Batch } from "./atomic";

type Row = Record<string, unknown>;
type Field = {
  name: string;
  type: string;
  isRequired: boolean;
  hasDefaultValue: boolean;
  default?: unknown;
  isUpdatedAt?: boolean;
};
type Model = { name: string; fields: Field[] };
const definitions = new Map<string, Model>(
  (models as Model[]).map((model) => [
    model.name[0].toLowerCase() + model.name.slice(1),
    model,
  ]),
);
const contextKey = Symbol.for("travelos.d1-auth-batch");
const shared = globalThis as unknown as Record<
  symbol,
  AsyncLocalStorage<AuthBatch>
>;
const storage = (shared[contextKey] ??= new AsyncLocalStorage<AuthBatch>());
export const activeD1AuthBatch = () => storage.getStore();
const q = (name: string) => `"${name}"`;
function field(model: Model, name: string) {
  const value = model.fields.find((f) => f.name === name);
  if (!value) throw Error("Unsupported authentication field");
  return value;
}
function encode(value: unknown): D1Value {
  if (value === null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(+value)) throw Error("Invalid authentication date");
    return value.toISOString().replace("Z", "+00:00");
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") {
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw Error("Unsafe authentication integer");
    return number;
  }
  if (typeof value === "string" || typeof value === "number") return value;
  throw Error("Unsupported authentication value");
}
function decode(model: Model, row: Row): Row {
  return Object.fromEntries(
    model.fields.map((f) => {
      let value = row[f.name] ?? null;
      if (value !== null && f.type === "DateTime")
        value = new Date(
          typeof value === "string" && /^\d{4}-\d\d-\d\d /.test(value)
            ? value.replace(" ", "T") + "Z"
            : (value as string | number),
        );
      if (value !== null && f.type === "Boolean") value = !!value;
      if (value !== null && f.type === "BigInt")
        value = BigInt(value as number | string);
      return [f.name, value];
    }),
  );
}
function whereSql(model: Model, where: Row | undefined): D1Statement {
  const values: D1Value[] = [];
  const scalar = (name: string, condition: unknown): string => {
    field(model, name);
    const col = q(name);
    if (condition === null) return `${col} IS NULL`;
    if (typeof condition !== "object" || condition instanceof Date) {
      values.push(encode(condition));
      return `${col}=?`;
    }
    const clauses = Object.entries(condition as Row)
      .filter(([, value]) => value !== undefined)
      .map(([operator, value]) => {
        if (operator === "equals") return scalar(name, value);
        if (operator === "not") return `NOT (${scalar(name, value)})`;
        if (operator === "in" || operator === "notIn") {
          if (!Array.isArray(value)) throw Error("Invalid authentication set");
          if (!value.length) return operator === "in" ? "0" : "1";
          values.push(...value.map(encode));
          return `${col} ${operator === "in" ? "IN" : "NOT IN"} (${value.map(() => "?").join(",")})`;
        }
        const compare: Record<string, string> = {
          gt: ">",
          gte: ">=",
          lt: "<",
          lte: "<=",
        };
        if (compare[operator]) {
          values.push(encode(value));
          return `${col}${compare[operator]}?`;
        }
        if (["contains", "startsWith", "endsWith"].includes(operator)) {
          if (typeof value !== "string")
            throw Error("Invalid authentication string filter");
          values.push(
            (operator !== "startsWith" ? "%" : "") +
              value.replace(/[\\%_]/g, "\\$&") +
              (operator !== "endsWith" ? "%" : ""),
          );
          return `${col} LIKE ? ESCAPE '\\'`;
        }
        throw Error("Unsupported authentication predicate");
      });
    return clauses.length ? clauses.join(" AND ") : "1";
  };
  const compile = (input: Row): string =>
    Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) => {
        if (["AND", "OR", "NOT"].includes(key)) {
          const list = Array.isArray(value) ? value : [value];
          if (list.some((v) => !v || typeof v !== "object"))
            throw Error("Invalid authentication predicate");
          const parts = list.map((v) => `(${compile(v as Row)})`);
          if (key === "NOT")
            return parts.map((part) => `NOT ${part}`).join(" AND ") || "1";
          return (
            parts.join(key === "OR" ? " OR " : " AND ") ||
            (key === "OR" ? "0" : "1")
          );
        }
        return `(${scalar(key, value)})`;
      })
      .join(" AND ") || "1";
  const sql = compile(where ?? {});
  if (values.length > 90)
    throw new HttpError(
      503,
      "Authentication operation is too large. Please retry.",
    );
  return { sql, values };
}
function prismaNotFound(): Error {
  return Object.assign(new Error("Authentication record not found"), {
    code: "P2025",
  });
}

/** An AUTH-ONLY unit of work. Reads are version-guarded; writes are staged and
 * committed once via native D1 batch. It never runs writes sequentially and
 * does not replace the application's general Prisma transaction semantics.
 */
class AuthBatch {
  readonly guards: D1Statement[] = [];
  readonly writes: D1Statement[] = [];
  private overlay = new Map<string, Map<string, Row | null>>();
  private guardKeys = new Set<string>();
  readonly client: object;
  constructor(readonly db: D1Database) {
    this.client = new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === "$transaction")
            return (fn: (tx: object) => Promise<unknown>) =>
              this.nested(() => fn(this.client));
          if (typeof key !== "string" || !definitions.has(key))
            throw Error(
              "Operation is outside the D1 authentication unit of work",
            );
          const model = definitions.get(key)!;
          return new Proxy(
            {},
            {
              get:
                (_delegate, method) =>
                (args: Row = {}) =>
                  this.operation(model, String(method), args),
            },
          );
        },
      },
    );
  }
  private addGuard(guard: D1Statement) {
    const key = JSON.stringify(guard);
    if (!this.guardKeys.has(key)) {
      this.guardKeys.add(key);
      this.guards.push(guard);
    }
  }
  private pending(model: Model) {
    let rows = this.overlay.get(model.name);
    if (!rows) {
      rows = new Map();
      this.overlay.set(model.name, rows);
    }
    return rows;
  }
  async nested<T>(fn: () => Promise<T>): Promise<T> {
    const writes = this.writes.length;
    const overlay = new Map(
      [...this.overlay].map(([table, rows]) => [table, new Map(rows)]),
    );
    try {
      return await fn();
    } catch (error) {
      this.writes.splice(writes);
      this.overlay = overlay;
      throw error;
    }
  }
  private async rows(model: Model, args: Row): Promise<Row[]> {
    if (args.include || args.distinct || args.cursor)
      throw Error("Unsupported authentication query shape");
    const predicate = whereSql(model, args.where as Row | undefined);
    const table = q(model.name);
    const raw = (
      await this.db
        .prepare(
          `SELECT t.*,COALESCE(v.version,0) AS __travelosRevision FROM ${table} t LEFT JOIN "_D1RecordVersion" v ON v.model=? AND v.id=t.id WHERE ${predicate.sql.replace(/"([A-Za-z][A-Za-z0-9]*)"/g, 't."$1"')} LIMIT 1001`,
        )
        .bind(model.name, ...(predicate.values ?? []))
        .all<Row>()
    ).results;
    if (raw.length > 1000)
      throw new HttpError(
        503,
        "Authentication operation exceeds the safe record limit.",
      );
    this.addGuard({
      sql: `SELECT COUNT(*)=? FROM ${table} WHERE ${predicate.sql}`,
      values: [raw.length, ...(predicate.values ?? [])],
    });
    for (let start = 0; start < raw.length; start += 30) {
      const part = raw.slice(start, start + 30);
      this.addGuard({
        sql: `SELECT COUNT(*)=? FROM ${table} t LEFT JOIN "_D1RecordVersion" v ON v.model=? AND v.id=t.id WHERE ${part.map(() => "(t.id=? AND COALESCE(v.version,0)=?)").join(" OR ")}`,
        values: [
          part.length,
          model.name,
          ...part.flatMap((row) => [
            String(row.id),
            Number(row.__travelosRevision),
          ]),
        ],
      });
    }
    const result = new Map(
      raw.map((row) => [String(row.id), decode(model, row)]),
    );
    for (const [id, row] of this.pending(model)) {
      result.delete(id);
      if (!row) continue;
      const entries = model.fields.map(
        (f) => [f.name, encode(row[f.name] ?? null)] as const,
      );
      const matches = await this.db
        .prepare(
          `SELECT 1 AS matched FROM (SELECT ${entries.map(([name]) => `? AS ${q(name)}`).join(",")}) WHERE ${predicate.sql}`,
        )
        .bind(...entries.map(([, value]) => value), ...(predicate.values ?? []))
        .first();
      if (matches) result.set(id, row);
    }
    let rows = [...result.values()];
    if (args.orderBy) {
      const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
      rows.sort((a, b) => {
        for (const entry of order as Row[])
          for (const [name, direction] of Object.entries(entry)) {
            field(model, name);
            const av = a[name] instanceof Date ? +(a[name] as Date) : a[name];
            const bv = b[name] instanceof Date ? +(b[name] as Date) : b[name];
            const n =
              av === bv
                ? 0
                : av === null
                  ? -1
                  : bv === null
                    ? 1
                    : (av as string | number) < (bv as string | number)
                      ? -1
                      : 1;
            if (n) return direction === "desc" ? -n : n;
          }
        return 0;
      });
    }
    const skip = Number(args.skip ?? 0),
      take = Number(args.take ?? 1000);
    if (
      !Number.isInteger(skip) ||
      skip < 0 ||
      !Number.isInteger(take) ||
      take < 0
    )
      throw Error("Unsupported authentication pagination");
    return rows.slice(skip, skip + take);
  }
  private selected(row: Row, select: unknown): Row {
    if (!select) return { ...row };
    return Object.fromEntries(
      Object.entries(select as Row).map(([key, value]) => {
        if (value !== true)
          throw Error("Unsupported authentication projection");
        return [key, row[key]];
      }),
    );
  }
  private defaults(model: Model, input: Row): Row {
    const row: Row = {};
    const now = new Date();
    for (const f of model.fields) {
      let value = input[f.name];
      if (value === undefined) {
        if (f.isUpdatedAt) value = now;
        else if (f.hasDefaultValue) {
          const d = f.default;
          if (d && typeof d === "object") {
            const name = (d as { name: string }).name;
            if (name === "now") value = now;
            else if (["cuid", "uuid"].includes(name)) value = randomUUID();
            else if (
              name === "dbgenerated" &&
              model.name === "Agency" &&
              f.name === "trialEndsAt"
            )
              value = new Date(+now + 14 * 86400000);
            else throw Error("Unsupported authentication default");
          } else value = d;
        } else if (!f.isRequired) value = null;
        else throw Error("Missing authentication field");
      }
      encode(value);
      row[f.name] = value;
    }
    for (const key of Object.keys(input)) field(model, key);
    return row;
  }
  private async operation(
    model: Model,
    method: string,
    args: Row,
  ): Promise<unknown> {
    if (
      [
        "findMany",
        "findFirst",
        "findUnique",
        "findFirstOrThrow",
        "findUniqueOrThrow",
        "count",
      ].includes(method)
    ) {
      const rows = await this.rows(model, args);
      if (method === "count") return rows.length;
      if (method === "findMany")
        return rows.map((row) => this.selected(row, args.select));
      if (!rows.length && method.endsWith("OrThrow")) throw prismaNotFound();
      return rows.length ? this.selected(rows[0], args.select) : null;
    }
    if (model.name === "Agency" && method !== "create")
      throw Error("Agency mutations require a separate D1 CRM operation");
    if (method === "create") {
      const row = this.defaults(model, args.data as Row);
      const entries = Object.entries(row);
      this.writes.push({
        sql: `INSERT INTO ${q(model.name)} (${entries.map(([name]) => q(name)).join(",")}) VALUES (${entries.map(() => "?").join(",")})`,
        values: entries.map(([, value]) => encode(value)),
      });
      this.pending(model).set(String(row.id), row);
      return this.selected(row, args.select);
    }
    if (!["update", "updateMany", "delete", "deleteMany"].includes(method))
      throw Error("Unsupported D1 authentication mutation");
    const rows = await this.rows(model, { where: args.where });
    const many = method.endsWith("Many");
    if (!many && rows.length !== 1) throw prismaNotFound();
    const predicate = whereSql(model, args.where as Row | undefined);
    if (method.startsWith("delete")) {
      if (model.name === "User") {
        for (const child of ["Session", "Account", "TwoFactor"]) {
          const childModel = [...definitions.values()].find(
            (m) => m.name === child,
          )!;
          for (const row of rows) {
            const children = await this.rows(childModel, {
              where: { userId: row.id },
            });
            for (const record of children)
              this.pending(childModel).set(String(record.id), null);
          }
        }
      }
      this.writes.push({
        sql: `DELETE FROM ${q(model.name)} WHERE ${predicate.sql}`,
        values: predicate.values,
      });
      for (const row of rows) this.pending(model).set(String(row.id), null);
      return many
        ? { count: rows.length }
        : this.selected(rows[0], args.select);
    }
    const data = { ...(args.data as Row) };
    for (const f of model.fields)
      if (f.isUpdatedAt && data[f.name] === undefined)
        data[f.name] = new Date();
    const assignments: string[] = [];
    const values: D1Value[] = [];
    const increments = new Map<string, number>();
    for (const [name, value] of Object.entries(data)) {
      const definition = field(model, name);
      if (value === undefined) continue;
      if (name === "id")
        throw Error("Authentication primary keys cannot be changed");
      if (
        value !== null &&
        typeof value === "object" &&
        !(value instanceof Date)
      ) {
        const expression = value as Row;
        const keys = Object.keys(expression);
        if (
          keys.length !== 1 ||
          !["increment", "decrement", "set"].includes(keys[0])
        )
          throw Error("Unsupported authentication update expression");
        if (keys[0] === "set") {
          data[name] = expression.set;
          assignments.push(`${q(name)}=?`);
          values.push(encode(expression.set));
          continue;
        }
        if (
          !["Int", "BigInt", "Float"].includes(definition.type) ||
          typeof expression[keys[0]] !== "number" ||
          !Number.isSafeInteger(expression[keys[0]])
        )
          throw Error("Invalid authentication increment");
        const delta =
          (keys[0] === "decrement" ? -1 : 1) * (expression[keys[0]] as number);
        increments.set(name, delta);
        assignments.push(`${q(name)}=${q(name)}+?`);
        values.push(delta);
        continue;
      }
      assignments.push(`${q(name)}=?`);
      values.push(encode(value));
    }
    if (!assignments.length)
      return many
        ? { count: rows.length }
        : this.selected(rows[0], args.select);
    this.writes.push({
      sql: `UPDATE ${q(model.name)} SET ${assignments.join(",")} WHERE ${predicate.sql}`,
      values: [...values, ...(predicate.values ?? [])],
    });
    const updated = rows.map((row) => {
      const next = {
        ...row,
        ...Object.fromEntries(
          Object.entries(data).filter(([, value]) => value !== undefined),
        ),
      };
      for (const [name, delta] of increments)
        next[name] =
          typeof row[name] === "bigint"
            ? (row[name] as bigint) + BigInt(delta)
            : Number(row[name]) + delta;
      return next;
    });
    for (const row of updated) this.pending(model).set(String(row.id), row);
    return many
      ? { count: updated.length }
      : this.selected(updated[0], args.select);
  }
  async commit() {
    if (this.writes.length)
      await guardedD1Batch(
        this.db,
        this.guards.length ? this.guards : [{ sql: "SELECT 1" }],
        this.writes,
      );
  }
}
export async function runD1AuthBatch<T>(
  db: D1Database,
  fn: () => Promise<T>,
): Promise<T> {
  const active = storage.getStore();
  if (active) {
    if (active.db !== db)
      throw Error(
        "Cannot share an authentication unit of work across D1 bindings",
      );
    return active.nested(fn);
  }
  const batch = new AuthBatch(db);
  return storage.run(batch, async () => {
    const value = await fn();
    await batch.commit();
    return value;
  });
}
