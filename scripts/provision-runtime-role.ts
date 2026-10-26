// Run once from a trusted operator machine, after migrations, with the database-owner URL.
// Credentials are read only from environment variables and are never printed.
import "dotenv/config";
import pg from "pg";
async function main() {
  const role = process.env.APP_DB_USER || "travelos_app",
    password = process.env.APP_DB_PASSWORD;
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(role) || !password || password.length < 32)
    throw new Error(
      "Set APP_DB_PASSWORD to a random 32+ character password; optional APP_DB_USER must be a simple lowercase SQL identifier.",
    );
  const client = new pg.Client({
    connectionString:
      process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
  });
  await client.connect();
  let started = false;
  try {
    await client.query("BEGIN");
    started = true;
    const existing = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (existing.rowCount)
      throw new Error(
        "Runtime role already exists. No password or permissions were changed; use your provider’s audited credential-rotation procedure.",
      );
    await client.query(
      `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password.replaceAll("'", "''")}'`,
    );
    const database = (await client.query("SELECT current_database() AS name"))
      .rows[0].name as string;
    const quotedDb = '"' + database.replaceAll('"', '""') + '"';
    await client.query(`GRANT CONNECT ON DATABASE ${quotedDb} TO "${role}"`);
    await client.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    const tables = [
      "Agency",
      "User",
      "Session",
      "Account",
      "Verification",
      "Lead",
      "Package",
      "Quote",
      "Booking",
      "Transaction",
      "Activity",
      "Spend",
      "RateLimit",
      "RequestBucket",
      "Invitation",
      "TwoFactor",
    ];
    await client.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ${tables.map((t) => '"' + t + '"').join(",")} TO "${role}"`,
    );
    const permissions = await client.query(
      "SELECT has_schema_privilege($1,'public','CREATE') AS can_create",
      [role],
    );
    if (permissions.rows[0].can_create)
      throw new Error(
        "The public schema grants CREATE to PUBLIC. Ask your database administrator to review those grants before provisioning.",
      );
    await client.query("COMMIT");
    started = false;
    console.log(
      `Runtime role ${role} created with application-table DML only. Set the web service DATABASE_URL to this role using the private password you supplied. Keep database-owner/migration credentials outside the web runtime. No credential values were printed.`,
    );
  } finally {
    if (started) await client.query("ROLLBACK");
    await client.end();
  }
}
main().catch((e) => {
  console.error(
    e instanceof Error &&
      /Set APP_DB|already exists|public schema/.test(e.message)
      ? e.message
      : "Role provisioning failed. Ask your database administrator to check owner privileges and existing grants. No secrets were printed.",
  );
  process.exitCode = 1;
});
