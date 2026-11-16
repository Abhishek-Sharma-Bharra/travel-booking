import { randomUUID } from "node:crypto";
import type { D1Database, D1Result } from "@cloudflare/workers-types";
import { HttpError } from "../http";

export type D1Value = string | number | null | ArrayBuffer | Uint8Array;
export interface D1Statement {
  sql: string;
  values?: D1Value[];
}
function prepare(db: D1Database, statement: D1Statement) {
  for (const value of statement.values ?? []) {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value)))
    )
      throw new TypeError("D1 numeric values must be finite and exact");
  }
  return db.prepare(statement.sql).bind(...(statement.values ?? []));
}

/** Internal SQL only. Validate actor/tenant scope before building a batch AND
 * include tenant/revision predicates in condition.sql. D1 evaluates the guard
 * and all writes in one atomic batch, including rollback on any error.
 * Do not split batches or implement interactive transactions with this helper.
 */
export async function atomicD1Batch(
  db: D1Database,
  condition: D1Statement,
  writes: D1Statement[],
): Promise<D1Result[]> {
  if (!writes.length || writes.length > 98)
    throw new RangeError("Atomic D1 batches require 1–98 write statements");
  const id = randomUUID();
  const guard = prepare(db, {
    sql: `INSERT INTO "_TravelOSAtomicGuard" ("id","ok") SELECT ?, CASE WHEN (${condition.sql}) THEN 1 ELSE 0 END`,
    values: [id, ...(condition.values ?? [])],
  });
  const statements = writes.map((statement) => prepare(db, statement));
  try {
    const result = await db.batch([
      guard,
      ...statements,
      db.prepare('DELETE FROM "_TravelOSAtomicGuard" WHERE "id"=?').bind(id),
    ]);
    return result.slice(1, -1);
  } catch (error) {
    if (
      /CHECK constraint failed|UNIQUE constraint failed|FOREIGN KEY constraint failed/i.test(
        error instanceof Error ? error.message : "",
      )
    )
      throw new HttpError(
        409,
        "This record changed or the operation conflicts with existing data. Refresh and retry.",
      );
    throw new HttpError(
      503,
      "The database operation could not be completed. Please retry.",
    );
  }
}
