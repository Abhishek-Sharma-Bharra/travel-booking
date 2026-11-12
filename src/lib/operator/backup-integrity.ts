import pg from "pg";
export async function publicTableCounts(client: pg.Client) {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  const result: Record<string, string> = {};
  for (const { tablename } of tables.rows) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.${quoted}`,
    );
    result[tablename] = rows.rows[0].count;
  }
  return result;
}
export function verifyRestoredCounts(
  expected: Record<string, string>,
  actual: Record<string, string>,
) {
  if (
    Object.keys(expected).length !== Object.keys(actual).length ||
    Object.entries(expected).some(([table, count]) => actual[table] !== count)
  )
    throw new Error(
      "Restored table inventory or row counts do not match the backup snapshot.",
    );
}
