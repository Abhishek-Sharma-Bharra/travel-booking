// Explicit operator command for existing roles after additive migrations. No password rotation.
import "dotenv/config";
import pg from "pg";
import { runtimeTables } from "../src/lib/runtime-tables";
async function main() {
  const role = process.env.APP_DB_USER || "travelos_app";
  if (
    !/^[a-z][a-z0-9_]{0,31}$/.test(role) ||
    !process.env.MIGRATION_DATABASE_URL
  )
    throw Error(
      "Set a controlled MIGRATION_DATABASE_URL and valid APP_DB_USER",
    );
  const c = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  await c.connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(
      "SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR has_schema_privilege(oid,'public','CREATE')) AS powerful FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (r.rowCount !== 1 || r.rows[0].powerful)
      throw Error("An existing least-privilege runtime role is required");
    await c.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ${runtimeTables.map((t) => '"' + t + '"').join(",")} TO "${role}"`,
    );
    await c.query("COMMIT");
    console.log(
      "Runtime application-table permissions updated. No passwords, migrations or schema permissions changed.",
    );
  } catch {
    await c.query("ROLLBACK");
    throw Error(
      "Runtime grants failed; transaction rolled back. Review operator role and applied migrations.",
    );
  } finally {
    await c.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
