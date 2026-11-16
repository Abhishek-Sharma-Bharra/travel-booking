import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { createSafeD1Adapter } from "../src/lib/d1/adapter";
import { atomicD1Batch } from "../src/lib/d1/atomic";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "travelos-d1-tests-only" },
  }),
);
let db: D1Database;
const run = (sql: string, ...values: (string | number | null)[]) =>
  db
    .prepare(sql)
    .bind(...values)
    .run();
const scalar = async (sql: string, ...values: (string | number)[]) =>
  (await db
    .prepare(sql)
    .bind(...values)
    .first<number>("value"))!;
before(async () => {
  db = await mf.getD1Database("DB");
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  const { unstable_splitSqlQuery } = await import("wrangler");
  const sql = await readFile(
    "cloudflare/d1/migrations/0001_initial.sql",
    "utf8",
  );
  // Use Wrangler's parser so multiline statements and trigger bodies stay intact.
  await db.batch(
    unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)),
  );
  await run(
    'INSERT INTO "Agency" (id,name) VALUES (?,?),(?,?)',
    "a",
    "Agency A",
    "b",
    "Agency B",
  );
  await run(
    'INSERT INTO "User" (id,name,email,"updatedAt","agencyId") VALUES (?,?,?,?,?),(?,?,?,?,?)',
    "ua",
    "Owner A",
    "a@test.invalid",
    "2026-11-16T00:00:00Z",
    "a",
    "ub",
    "Owner B",
    "b@test.invalid",
    "2026-11-16T00:00:00Z",
    "b",
  );
  await run(
    `INSERT INTO "Lead" (id,"agencyId","externalId",customer,destination,"travelStart","travelEnd",travellers,budget,source,"assignedId","updatedAt") VALUES ('lead','a','one','Traveller','Kerala','2026-12-01','2026-12-05',2,50000,'Website','ua','2026-11-16')`,
  );
  await run(
    `INSERT INTO "Package" (id,"agencyId",name,destination,days,inclusions,exclusions,price,"estimatedCost") VALUES ('pkg','a','Kerala','Kerala',4,'Stay','Flights',25000,15000)`,
  );
  await run(
    `INSERT INTO "Quote" (id,"agencyId","leadId","packageId",travellers,"unitPrice","travelStart","travelEnd","packageName",destination,duration,inclusions,exclusions,discount,"taxBps",total,"estimatedCost") VALUES ('quote','a','lead','pkg',2,25000,'2026-12-01','2026-12-05','Kerala','Kerala',4,'Stay','Flights',0,0,50000,30000)`,
  );
  await run(
    `INSERT INTO "Booking" (id,"agencyId","leadId","quoteId",total,"dueDate","travelStart","travelEnd") VALUES ('booking','a','lead','quote',50000,'2026-12-01','2026-12-01','2026-12-05')`,
  );
});
after(async () => {
  await mf.dispose();
});
test("D1 migration creates all 35 app tables, composite keys and empty foreign-key violations", async () => {
  assert.equal(
    await scalar(
      `SELECT count(*) AS value FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'_TravelOSAtomicGuard'`,
    ),
    35,
  );
  assert.deepEqual(
    (await db.prepare("PRAGMA foreign_key_check").all()).results,
    [],
  );
  assert.ok(
    (await scalar(
      `SELECT count(*) AS value FROM pragma_foreign_key_list('Booking')`,
    )) > 3,
  );
});
test("D1 rejects cross-tenant relations and duplicate quote versions", async () => {
  await assert.rejects(
    run(`UPDATE "Lead" SET "assignedId"='ub' WHERE id='lead'`),
    /FOREIGN KEY/,
  );
  await assert.rejects(
    run(`UPDATE "Booking" SET "agencyId"='b' WHERE id='booking'`),
    /FOREIGN KEY/,
  );
  // Copy a full quote with a new id but the same scoped version.
  const fields = (
    await db.prepare(`PRAGMA table_info('Quote')`).all<{ name: string }>()
  ).results.map((row) => `"${row.name}"`);
  await assert.rejects(
    run(
      `INSERT INTO "Quote" (${fields.join(",")}) SELECT ${fields.map((field) => (field === '"id"' ? "'duplicate'" : field)).join(",")} FROM "Quote" WHERE id='quote'`,
    ),
    /UNIQUE constraint/,
  );
});
test("D1 preserves ledger checks, money exactness and advertising counter range", async () => {
  await assert.rejects(
    run(
      `INSERT INTO "Transaction" (id,"agencyId","bookingId",kind,amount) VALUES ('bad','a','booking','Receipt',-1)`,
    ),
    /CHECK constraint/,
  );
  await assert.rejects(
    run(
      `INSERT INTO "Transaction" (id,"agencyId","bookingId",kind,amount,"dateBasis") VALUES ('bad','a','booking','Receipt',1,'UNKNOWN')`,
    ),
    /CHECK constraint/,
  );
  await assert.rejects(
    run(`UPDATE "User" SET role='ADMIN' WHERE id='ua'`),
    /CHECK constraint/,
  );
  await assert.rejects(
    run(`UPDATE "Lead" SET budget=2147483648 WHERE id='lead'`),
    /CHECK constraint/,
  );
});
test("D1 rejects counters beyond JavaScript integer precision without rounding", async () => {
  await run(
    `INSERT INTO "IntegrationConnection" (id,"agencyId",provider,credentials) VALUES ('connection','a','META','fictional-encrypted-test')`,
  );
  await run(
    `INSERT INTO "AdDailyMetric" (id,"agencyId","connectionId",day,"campaignId","campaignName","spendMicros",impressions,clicks,currency,timezone) VALUES ('metric','a','connection','2026-11-16','campaign','Test',9007199254740991,1,1,'INR','Asia/Kolkata')`,
  );
  assert.equal(
    await scalar(
      `SELECT "spendMicros" AS value FROM "AdDailyMetric" WHERE id='metric'`,
    ),
    Number.MAX_SAFE_INTEGER,
  );
  await assert.rejects(
    run(
      `UPDATE "AdDailyMetric" SET "spendMicros"=9007199254740992 WHERE id='metric'`,
    ),
    /CHECK constraint/,
  );
  await assert.rejects(
    run(`UPDATE "AdDailyMetric" SET impressions=-1 WHERE id='metric'`),
    /CHECK constraint/,
  );
});
test("D1 native batch rolls back every write after a failing guard or later constraint", async () => {
  await assert.rejects(
    atomicD1Batch(db, { sql: "SELECT 0" }, [
      { sql: `UPDATE "Lead" SET customer='wrong' WHERE id='lead'` },
    ]),
    /record changed/,
  );
  await assert.rejects(
    atomicD1Batch(db, { sql: "SELECT 1" }, [
      { sql: `UPDATE "Lead" SET customer='wrong' WHERE id='lead'` },
      {
        sql: `INSERT INTO "Transaction" (id,"agencyId","bookingId",kind,amount) VALUES ('bad','a','booking','Receipt',-1)`,
      },
    ]),
    /record changed/,
  );
  assert.equal(
    await db
      .prepare(`SELECT customer FROM "Lead" WHERE id='lead'`)
      .first("customer"),
    "Traveller",
  );
  assert.equal(
    await scalar(`SELECT count(*) AS value FROM "_TravelOSAtomicGuard"`),
    0,
  );
});
test("D1 competing version guards allow one winner and never leave partial writes", async () => {
  const writes = [
    { sql: `UPDATE "Lead" SET "quotedPrice"=123 WHERE id='lead'` },
    {
      sql: `UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE id='a'`,
    },
  ];
  const result = await Promise.allSettled(
    [1, 2].map(() =>
      atomicD1Batch(
        db,
        { sql: `SELECT "adSpendRevision"=0 FROM "Agency" WHERE id='a'` },
        writes,
      ),
    ),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await scalar(
      `SELECT "adSpendRevision" AS value FROM "Agency" WHERE id='a'`,
    ),
    1,
  );
  assert.equal(
    await scalar(`SELECT count(*) AS value FROM "_TravelOSAtomicGuard"`),
    0,
  );
});
test("D1 invalidates direct-cost and advertising attestations on all row mutations", async () => {
  await run(`UPDATE "Booking" SET "directCostsComplete"=1 WHERE id='booking'`);
  const before = await scalar(
    `SELECT "costRevision" AS value FROM "Booking" WHERE id='booking'`,
  );
  await run(
    `INSERT INTO "Transaction" (id,"agencyId","bookingId",kind,amount) VALUES ('cost','a','booking','Expense',100)`,
  );
  assert.equal(
    await scalar(
      `SELECT "directCostsComplete" AS value FROM "Booking" WHERE id='booking'`,
    ),
    0,
  );
  assert.equal(
    await scalar(
      `SELECT "costRevision" AS value FROM "Booking" WHERE id='booking'`,
    ),
    before + 1,
  );
  await run(`UPDATE "Transaction" SET amount=150 WHERE id='cost'`);
  await run(`DELETE FROM "Transaction" WHERE id='cost'`);
  assert.equal(
    await scalar(
      `SELECT "costRevision" AS value FROM "Booking" WHERE id='booking'`,
    ),
    before + 4,
  );
  await run(
    `INSERT INTO "ReportingCoverage" (id,"agencyId","fromDate","toDate",timezone,"attestedBy") VALUES ('coverage','a','2026-11-01','2026-11-30','Asia/Kolkata','ua')`,
  );
  await run(
    `INSERT INTO "Spend" (id,"agencyId",month,kind,channel,amount) VALUES ('spend','a','2026-11','Advertising','Google',100)`,
  );
  assert.equal(
    await scalar(
      `SELECT count(*) AS value FROM "ReportingCoverage" WHERE id='coverage'`,
    ),
    0,
  );
});
test("D1 adapter fails closed on unsupported interactive transactions", async () => {
  const adapter = await createSafeD1Adapter(db).connect();
  try {
    await assert.rejects(
      adapter.startTransaction(),
      /interactive transactions are disabled/,
    );
  } finally {
    await adapter.dispose();
  }
});
test("D1 batch limits and unsafe integers fail before any database writes", async () => {
  await assert.rejects(atomicD1Batch(db, { sql: "SELECT 1" }, []), /1–98/);
  await assert.rejects(
    atomicD1Batch(db, { sql: "SELECT 1" }, [
      { sql: "SELECT ?", values: [Number.MAX_SAFE_INTEGER + 1] },
    ]),
    /finite and exact/,
  );
});
