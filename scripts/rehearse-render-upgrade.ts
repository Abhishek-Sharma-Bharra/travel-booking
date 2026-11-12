import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, cp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";

// Disposable local databases only. Never restores over an existing database.
async function main() {
  const root = process.cwd();
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw Error("Migration rehearsal requires local PostgreSQL");
  const admin = new pg.Client({ connectionString: url.href });
  const folders = (
    await readdir(join(root, "prisma/migrations"), { withFileTypes: true })
  )
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort();
  async function migrate(target: string, cwd: string) {
    const r = spawnSync(
      process.execPath,
      [
        "--import",
        join(root, "node_modules/tsx/dist/loader.mjs"),
        join(root, "scripts/migrate.ts"),
      ],
      {
        cwd,
        env: {
          ...process.env,
          DATABASE_URL: target,
          MIGRATION_DATABASE_URL: target,
        },
        encoding: "utf8",
        timeout: 45000,
      },
    );
    assert.equal(
      r.status,
      0,
      "Migration runner failed; inspect disposable database, never reset production",
    );
  }
  await admin.connect();
  try {
    for (const mode of ["fresh", "original", "current"]) {
      const name = "travelos_upgrade_" + randomBytes(8).toString("hex");
      const folder = await mkdtemp(join(tmpdir(), "travelos-upgrade-"));
      const target = new URL(url);
      target.pathname = "/" + name;
      await admin.query(`CREATE DATABASE "${name}"`);
      const client = new pg.Client({ connectionString: target.href });
      try {
        await client.connect();
        if (mode !== "fresh") {
          await mkdir(join(folder, "prisma/migrations"), { recursive: true });
          await cp(
            join(root, "prisma/schema.prisma"),
            join(folder, "prisma/schema.prisma"),
          );
          await cp(
            join(root, "prisma/migrations/migration_lock.toml"),
            join(folder, "prisma/migrations/migration_lock.toml"),
          );
          const names = [
            "20261024000000_initial",
            "20261024010000_quote_snapshots",
          ];
          if (mode === "current")
            names.push("20261112000000_sales_quote_versions");
          for (const n of names)
            await cp(
              join(root, "prisma/migrations", n),
              join(folder, "prisma/migrations", n),
              { recursive: true },
            );
          await migrate(target.href, folder);
          await client.query(`INSERT INTO "Agency" (id,name,"createdAt") VALUES ('a','Upgrade fixture','2020-01-01');
          INSERT INTO "User" (id,name,email,"agencyId","updatedAt") VALUES ('u','Fixture','fixture@example.test','a',CURRENT_TIMESTAMP);
          INSERT INTO "Lead" (id,"agencyId","externalId",customer,destination,"travelStart","travelEnd",travellers,budget,source,"assignedId","updatedAt") VALUES ('l','a','fixture','Fixture traveller','Kerala','2027-01-01','2027-01-05',2,10000,'Website','u',CURRENT_TIMESTAMP);
          INSERT INTO "Package" (id,"agencyId",name,destination,days,inclusions,exclusions,price,"estimatedCost") VALUES ('p','a','Original package','Kerala',5,'Hotel','Flight',10000,5000);`);
          for (const [id, date, version] of [
            ["q1", "2026-01-01", 7],
            ["q2", "2026-01-02", 1],
          ]) {
            const versionColumn = mode === "current" ? ",version" : "";
            const versionValue = mode === "current" ? ",$3" : "";
            await client.query(
              `INSERT INTO "Quote" (id,"agencyId","leadId","packageId",travellers,"unitPrice",discount,"taxBps",total,"estimatedCost","createdAt","travelStart","travelEnd","packageName",destination,duration,inclusions,exclusions${versionColumn}) VALUES ($1,'a','l','p',2,10000,0,0,20000,10000,$2,'2027-01-01','2027-01-05','Original package','Kerala',5,'Hotel','Flight'${versionValue})`,
              mode === "current" ? [id, date, version] : [id, date],
            );
          }
          await client.query(`UPDATE "Quote" SET status='Accepted' WHERE id='q1';
            UPDATE "Lead" SET stage='Won' WHERE id='l';
            INSERT INTO "Booking" (id,"agencyId","leadId","quoteId",total,"dueDate","travelStart","travelEnd") VALUES ('b','a','l','q1',20000,'2027-01-01','2027-01-01','2027-01-05');
            INSERT INTO "Transaction" (id,"agencyId","bookingId",kind,amount,memo) VALUES ('t','a','b','Receipt',10000,'Legacy receipt');`);
        }
        await migrate(target.href, root);
        const tracked = await client.query(
          'SELECT count(*)::int n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
        );
        assert.equal(tracked.rows[0].n, folders.length);
        if (mode !== "fresh") {
          const quotes = await client.query(
            'SELECT id,version,total,"packageName" FROM "Quote" ORDER BY id',
          );
          assert.equal(quotes.rowCount, 2);
          assert.deepEqual(
            quotes.rows.map((x) => x.version),
            mode === "current" ? [7, 1] : [1, 2],
          );
          assert.ok(
            quotes.rows.every(
              (x) => x.total === 20000 && x.packageName === "Original package",
            ),
          );
          const agency = await client.query(
            'SELECT "trialEndsAt">CURRENT_TIMESTAMP AS active FROM "Agency" WHERE id=\'a\'',
          );
          assert.equal(agency.rows[0].active, true);
          const ledger = await client.query(
            `SELECT b.total, t.amount, t.memo, t."dateBasis" FROM "Booking" b JOIN "Transaction" t ON t."bookingId"=b.id WHERE b.id='b'`,
          );
          assert.equal(ledger.rowCount, 1);
          assert.deepEqual(ledger.rows[0], {
            total: 20000,
            amount: 10000,
            memo: "Legacy receipt",
            dateBasis: "CALENDAR",
          });
        }
        console.log(
          `${mode}: ${folders.length} tracked migrations; historical records/versions and trial access preserved`,
        );
      } finally {
        await client.end();
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        await rm(folder, { recursive: true, force: true });
      }
    }
  } finally {
    await admin.end();
  }
}
main().catch(() => {
  console.error(
    "Local upgrade rehearsal failed; inspect the local test results.",
  );
  process.exitCode = 1;
});
