import type { D1Database } from "@cloudflare/workers-types";
import type { D1Statement, D1Value } from "./atomic";
import { guardedD1Batch } from "./atomic";
import definitions from "../../../cloudflare/d1/model-definitions.json";
import { randomUUID } from "node:crypto";
import { HttpError } from "../http";
type Row = Record<string, unknown>;
type Field = {
  name: string;
  type: string;
  isRequired: boolean;
  hasDefaultValue: boolean;
  default?: unknown;
  isUpdatedAt?: boolean;
};
const models = new Map(
  (definitions as { name: string; fields: Field[] }[]).map((model) => [
    model.name,
    model,
  ]),
);
export const quoteIdentifier = (name: string) => {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name))
    throw Error("Invalid internal D1 identifier");
  return `"${name}"`;
};
export function encodeD1(value: unknown): D1Value {
  if (value === null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(+value)) throw Error("Invalid D1 date");
    return value.toISOString().replace("Z", "+00:00");
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw Error("Unsafe D1 integer");
    return number;
  }
  if (typeof value === "string" || typeof value === "number") return value;
  return JSON.stringify(value);
}
function modelFor(name: string) {
  const model = models.get(name);
  if (!model) throw Error("Unknown D1 model");
  return model;
}
export function d1Record<T>(modelName: string, row: Row): T {
  const model = modelFor(modelName),
    result: Row = {};
  for (const field of model.fields) {
    let value = row[field.name] ?? null;
    if (value !== null && field.type === "DateTime")
      value = new Date(
        typeof value === "string" && /^\d{4}-\d\d-\d\d /.test(value)
          ? value.replace(" ", "T") + "Z"
          : (value as string | number),
      );
    if (value !== null && field.type === "Boolean") value = !!value;
    if (value !== null && field.type === "Json" && typeof value === "string")
      value = JSON.parse(value);
    if (value !== null && field.type === "BigInt")
      value = BigInt(value as string | number);
    result[field.name] = value;
  }
  return result as T;
}
export function newD1Record(modelName: string, data: Row): Row {
  const model = modelFor(modelName),
    row: Row = {},
    now = new Date();
  for (const field of model.fields) {
    let value = data[field.name];
    if (value === undefined) {
      if (field.isUpdatedAt) value = now;
      else if (field.hasDefaultValue) {
        const def = field.default;
        if (def && typeof def === "object") {
          const kind = (def as { name: string }).name;
          if (["cuid", "uuid"].includes(kind)) value = randomUUID();
          else if (kind === "now") value = now;
          else if (
            kind === "dbgenerated" &&
            modelName === "Agency" &&
            field.name === "trialEndsAt"
          )
            value = new Date(+now + 14 * 86400000);
          else throw Error("Unsupported D1 model default");
        } else
          value =
            field.type === "Json" && typeof def === "string"
              ? JSON.parse(def)
              : def;
      } else if (!field.isRequired) value = null;
      else throw Error("Required D1 record value missing");
    }
    row[field.name] = value;
  }
  for (const name of Object.keys(data))
    if (!model.fields.some((f) => f.name === name))
      throw Error("Unexpected D1 model field");
  return row;
}
export function insertD1(modelName: string, row: Row): D1Statement {
  const entries = Object.entries(row);
  return {
    sql: `INSERT INTO ${quoteIdentifier(modelName)} (${entries.map(([name]) => quoteIdentifier(name)).join(",")}) VALUES (${entries.map(() => "?").join(",")})`,
    values: entries.map(([, value]) => encodeD1(value)),
  };
}
export function bulkInsertD1(modelName: string, rows: Row[]): D1Statement {
  if (!rows.length) throw Error("Empty D1 insert");
  const fields = modelFor(modelName).fields.map((f) => f.name);
  const data = rows.map((row) =>
    Object.fromEntries(
      fields.map((name) => [name, encodeD1(row[name] ?? null)]),
    ),
  );
  return {
    sql: `INSERT INTO ${quoteIdentifier(modelName)} (${fields.map(quoteIdentifier).join(",")}) SELECT ${fields.map((name) => `json_extract(value,'$.${name}')`).join(",")} FROM json_each(?)`,
    values: [JSON.stringify(data)],
  };
}
export function updateD1(
  modelName: string,
  id: string,
  data: Row,
): D1Statement {
  const model = modelFor(modelName),
    values = { ...data };
  for (const f of model.fields)
    if (f.isUpdatedAt && values[f.name] === undefined)
      values[f.name] = new Date();
  const entries = Object.entries(values).filter(
    ([, value]) => value !== undefined,
  );
  for (const [name] of entries)
    if (!model.fields.some((f) => f.name === name) || name === "id")
      throw Error("Invalid D1 update field");
  return {
    sql: `UPDATE ${quoteIdentifier(modelName)} SET ${entries.map(([name]) => `${quoteIdentifier(name)}=?`).join(",")} WHERE id=?`,
    values: [...entries.map(([, value]) => encodeD1(value)), id],
  };
}

/** Explicit native-batch unit for CRM operations. This is not a generic ORM
 * transaction substitute; every caller declares SQL reads and writes. */
export class D1Unit {
  readonly guards: D1Statement[] = [];
  readonly writes: D1Statement[] = [];
  constructor(readonly db: D1Database) {}
  guard(sql: string, ...values: D1Value[]) {
    this.guards.push({ sql, values });
  }
  async read<T>(
    modelName: string,
    where: string,
    values: D1Value[] = [],
  ): Promise<T[]> {
    modelFor(modelName);
    const table = quoteIdentifier(modelName);
    const raw = (
      await this.db
        .prepare(
          `SELECT t.*,COALESCE(v.version,0) AS __version FROM ${table} t LEFT JOIN "_D1RecordVersion" v ON v.model=? AND v.id=t.id WHERE ${where.replace(/"([A-Za-z][A-Za-z0-9]*)"/g, 't."$1"')} LIMIT 1001`,
        )
        .bind(modelName, ...values)
        .all<Row>()
    ).results;
    if (raw.length > 1000)
      throw new HttpError(
        503,
        "This operation exceeds the safe batch record limit.",
      );
    this.guard(
      `SELECT COUNT(*)=? FROM ${table} WHERE ${where}`,
      raw.length,
      ...values,
    );
    for (let start = 0; start < raw.length; start += 30) {
      const part = raw.slice(start, start + 30);
      this.guard(
        `SELECT COUNT(*)=? FROM ${table} t LEFT JOIN "_D1RecordVersion" v ON v.model=? AND v.id=t.id WHERE ${part.map(() => "(t.id=? AND COALESCE(v.version,0)=?)").join(" OR ")}`,
        part.length,
        modelName,
        ...part.flatMap((row) => [String(row.id), Number(row.__version)]),
      );
    }
    return raw.map((row) => d1Record<T>(modelName, row));
  }
  async count(modelName: string, where: string, values: D1Value[] = []) {
    modelFor(modelName);
    const sql = `SELECT COUNT(*) AS n FROM ${quoteIdentifier(modelName)} WHERE ${where}`;
    const n = Number(
      (await this.db
        .prepare(sql)
        .bind(...values)
        .first<{ n: number }>())!.n,
    );
    this.guard(
      `SELECT COUNT(*)=? FROM ${quoteIdentifier(modelName)} WHERE ${where}`,
      n,
      ...values,
    );
    return n;
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
