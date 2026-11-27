import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { db } from "../src/lib/db";
import {
  requestResources,
  closeResources,
  type RequestResources,
} from "../src/lib/request-resources";
import { saveSupplier, supplierOverview } from "../src/lib/suppliers/service";
import {
  emptySupplierProfile,
  supplierProfileSchema,
} from "../src/lib/suppliers/format";
import type { Actor } from "../src/lib/access";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "supplier-tests" },
  }),
);
let binding: D1Database, pgUrl: string, pool: Pool;
const legacy = new Map<string, string>();
const databaseName = "test_suppliers_" + randomUUID().replaceAll("-", "");
before(async () => {
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  const u = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(u.hostname));
  pool = new Pool({ connectionString: u.toString() });
  await pool.query(`CREATE DATABASE "${databaseName}"`);
  u.pathname = "/" + databaseName;
  pgUrl = u.toString();
  const local = new Pool({ connectionString: pgUrl });
  try {
    for (const d of (await readdir("prisma/migrations")).sort()) {
      if (!/^\d/.test(d)) continue;
      if (d === "20261127000000_supplier_directory") {
        const a = await scope("postgresql", () =>
          db.agency.create({
            data: {
              name: "Existing paid supplier migration test",
              plan: "Growth",
              subscription: "Active",
              subscriptionExpiresAt: new Date("2027-12-31T00:00:00Z"),
            },
          }),
        );
        legacy.set("postgresql", a.id);
      }
      await local.query(
        await readFile(`prisma/migrations/${d}/migration.sql`, "utf8"),
      );
    }
  } finally {
    await local.end();
  }
  binding = await mf.getD1Database("DB");
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const f of (await readdir("cloudflare/d1/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (f === "0011_supplier_directory.sql") {
      const a = await scope("d1", () =>
        db.agency.create({
          data: {
            name: "Existing paid supplier migration test",
            plan: "Growth",
            subscription: "Active",
            subscriptionExpiresAt: new Date("2027-12-31T00:00:00Z"),
          },
        }),
      );
      legacy.set("d1", a.id);
    }
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile(`cloudflare/d1/migrations/${f}`, "utf8"),
      ).map((s) => binding.prepare(s)),
    );
  }
});
after(async () => {
  await mf.dispose();
  if (pool) {
    await pool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await pool.end();
  }
});
async function scope<T>(engine: "d1" | "postgresql", fn: () => Promise<T>) {
  const r: RequestResources = {
    databaseEngine: engine,
    databaseUrl: engine === "d1" ? "" : pgUrl,
    d1: engine === "d1" ? binding : undefined,
    values: new Map(),
    cleanup: [],
  };
  return requestResources.run(r, async () => {
    try {
      return await fn();
    } finally {
      await closeResources(r);
    }
  });
}
async function fixture() {
  const agency = await db.agency.create({
    data: {
      name: "Fictional supplier test",
      plan: "Growth",
      subscription: "Active",
      subscriptionExpiresAt: new Date(Date.now() + 86400000),
    },
  });
  const make = async (role: string) => {
    const u = await db.user.create({
      data: {
        id: randomUUID(),
        name: "Supplier " + role,
        email: randomUUID() + "@test.invalid",
        agencyId: agency.id,
        role,
      },
    });
    return { id: u.id, agencyId: agency.id, role } satisfies Actor;
  };
  const owner = await make("OWNER"),
    agent = await make("AGENT"),
    manager = await make("MANAGER");
  const foreignAgency = await db.agency.create({
      data: { name: "Private elsewhere" },
    }),
    f = await db.user.create({
      data: {
        id: randomUUID(),
        name: "Foreign owner",
        email: randomUUID() + "@test.invalid",
        agencyId: foreignAgency.id,
        role: "OWNER",
      },
    });
  return {
    agency,
    owner,
    agent,
    manager,
    foreign: {
      id: f.id,
      agencyId: foreignAgency.id,
      role: "OWNER",
    } satisfies Actor,
  };
}
function command() {
  const profile = emptySupplierProfile();
  profile.name = "Private Mountain Hotel";
  profile.city = "Delhi";
  profile.email = "supplier@test.invalid";
  profile.contract = {
    ...profile.contract,
    reference: "Fictional-2026",
    status: "RECORDED",
    validFrom: "2026-11-01",
    validUntil: "2027-03-31",
    ratePaise: 150025,
    rateUnit: "NIGHT",
    paymentTerms: "By agreement",
    cancellationTerms: "Review cancellation with supplier",
  };
  return { requestId: randomUUID(), revision: 0, profile };
}
for (const engine of ["d1", "postgresql"] as const) {
  test(`${engine}: supplier snapshots preserve exact rates, tenant/role isolation, existing plans and immutable history`, () =>
    scope(engine, async () => {
      const f = await fixture(),
        c = command(),
        r = await saveSupplier(f.owner, c);
      const doc = await supplierOverview(f.manager, { id: r.id });
      assert.ok(doc.supplier && doc.versions);
      assert.equal(doc.supplier.profile.contract.ratePaise, 150025);
      assert.equal(doc.versions.length, 1);
      const replay = await saveSupplier(f.owner, c);
      assert.equal(replay.id, r.id);
      assert.equal(replay.replayed, true);
      await assert.rejects(
        saveSupplier(f.owner, {
          ...c,
          profile: { ...c.profile, name: "Reused different payload" },
        }),
        /request key/,
      );
      for (const actor of [f.foreign, f.agent, { ...f.agent, role: "OWNER" }]) {
        await assert.rejects(
          supplierOverview(actor, { id: r.id }),
          /not found|owner or manager/,
        );
        await assert.rejects(
          saveSupplier(actor, { ...command(), id: r.id }),
          /not found|owner or manager/,
        );
      }
      const second = await saveSupplier(f.manager, {
        ...c,
        id: r.id,
        requestId: randomUUID(),
        profile: {
          ...c.profile,
          contract: { ...c.profile.contract, ratePaise: 250000 },
        },
      });
      assert.equal(second.revision, 1);
      await assert.rejects(
        saveSupplier(f.owner, { ...c, id: r.id, requestId: randomUUID() }),
        /changed/,
      );
      const history = await supplierOverview(f.owner, { id: r.id });
      assert.ok(history.versions);
      assert.equal(history.versions[0].profile.contract.ratePaise, 250000);
      assert.equal(history.versions[1].profile.contract.ratePaise, 150025);
      await assert.rejects(
        db.$executeRaw`UPDATE "AgencySupplierVersion" SET payload='{}' WHERE "supplierId"=${r.id}`,
        /immutable/,
      );
      await assert.rejects(
        db.$executeRaw`DELETE FROM "AgencySupplierVersion" WHERE "supplierId"=${r.id}`,
        /immutable/,
      );
      const after = await db.agency.findUniqueOrThrow({
        where: { id: f.agency.id },
      });
      assert.equal(after.plan, "Growth");
      assert.equal(after.subscription, "Active");
      assert.equal(
        +after.subscriptionExpiresAt!,
        +f.agency.subscriptionExpiresAt!,
      );
      await db.user.update({
        where: { id: f.owner.id },
        data: { disabled: true },
      });
      await assert.rejects(
        supplierOverview(f.owner),
        /active owner or manager/,
      );
    }));
  test(`${engine}: concurrent duplicate supplier writes return one immutable version and permit safe replay`, () =>
    scope(engine, async () => {
      const f = await fixture(),
        c = command();
      const values = await Promise.all([
        saveSupplier(f.owner, c),
        saveSupplier(f.owner, c),
      ]);
      assert.equal(values[0].id, values[1].id);
      const overview = await supplierOverview(f.owner);
      assert.ok(overview.suppliers);
      assert.equal(overview.suppliers.length, 1);
      const doc = await supplierOverview(f.owner, { id: values[0].id });
      assert.ok(doc.versions);
      assert.equal(doc.versions.length, 1);
      const archived = await saveSupplier(f.owner, {
        ...c,
        id: values[0].id,
        requestId: randomUUID(),
        profile: { ...c.profile, status: "ARCHIVED" },
      });
      assert.equal(archived.revision, 1);
      await db.agency.update({
        where: { id: f.agency.id },
        data: { subscription: "Paused" },
      });
      await assert.rejects(saveSupplier(f.owner, command()), /inactive/);
      await supplierOverview(f.owner);
    }));
  test(`${engine}: audit failure rolls back supplier and version, while literal SQL-like names remain data`, () =>
    scope(engine, async () => {
      const f = await fixture();
      const c = command();
      c.profile.name = "Literal '; DROP TABLE Agency; --";
      const created = await saveSupplier(f.owner, c);
      const listed = await supplierOverview(f.owner, { search: "DROP TABLE" });
      assert.ok(listed.suppliers);
      assert.equal(listed.suppliers[0].id, created.id);
      if (engine === "d1")
        await binding.exec(
          `CREATE TRIGGER fail_supplier_audit BEFORE INSERT ON "Activity" WHEN NEW.action LIKE 'Supplier %' BEGIN SELECT RAISE(ABORT,'forced audit failure'); END;`,
        );
      else
        await db.$executeRawUnsafe(
          `CREATE FUNCTION fail_supplier_audit_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Supplier %' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END; $$;`,
        );
      if (engine === "postgresql")
        await db.$executeRawUnsafe(
          `CREATE TRIGGER fail_supplier_audit BEFORE INSERT ON "Activity" FOR EACH ROW EXECUTE FUNCTION fail_supplier_audit_fn()`,
        );
      try {
        await assert.rejects(saveSupplier(f.owner, command()));
        const after = await supplierOverview(f.owner);
        assert.ok(after.suppliers);
        assert.equal(after.suppliers.length, 1);
        const history = await supplierOverview(f.owner, { id: created.id });
        assert.ok(history.versions);
        assert.equal(history.versions.length, 1);
      } finally {
        if (engine === "d1")
          await binding.exec("DROP TRIGGER fail_supplier_audit");
        else {
          await db.$executeRawUnsafe(
            'DROP TRIGGER fail_supplier_audit ON "Activity"',
          );
          await db.$executeRawUnsafe("DROP FUNCTION fail_supplier_audit_fn()");
        }
      }
    }));
}
test("supplier validation rejects incomplete recorded terms, malformed dates, currencies and fractional paise", () => {
  const c = command().profile;
  assert.equal(supplierProfileSchema.parse(c).contract.ratePaise, 150025);
  for (const contract of [
    { ...c.contract, validUntil: "2026-02-30" },
    { ...c.contract, paymentTerms: "" },
    { ...c.contract, validUntil: "2020-01-01" },
    { ...c.contract, ratePaise: 0.5 },
    { ...c.contract, currency: "USD" },
    { ...c.contract, rateUnit: null },
  ])
    assert.equal(
      supplierProfileSchema.safeParse({ ...c, contract }).success,
      false,
    );
});

test("additive supplier migrations preserve existing paid customer contracts", async () => {
  for (const engine of ["d1", "postgresql"] as const)
    await scope(engine, async () => {
      const id = legacy.get(engine);
      assert.ok(id, "Legacy record seeded before supplier migration");
      const a = await db.agency.findUniqueOrThrow({ where: { id } });
      assert.equal(a.plan, "Growth");
      assert.equal(a.subscription, "Active");
      assert.equal(
        a.subscriptionExpiresAt!.toISOString(),
        "2027-12-31T00:00:00.000Z",
      );
    });
});

for (const engine of ["d1", "postgresql"] as const) {
  test(`${engine}: explicit automatic enquiry assignment uses least open workload and excludes closed/foreign/disabled staff`, () =>
    scope(engine, async () => {
      const { mutate } = await import("../src/lib/actions");
      const { AUTO_ASSIGNEE } = await import("../src/lib/lead-assignment");
      const f = await fixture();
      const lead = (externalId: string, assignedId: string, stage = "New") => ({
        externalId,
        assignedId,
        stage,
        customer: "Assignment Traveller",
        email: "",
        phone: "",
        destination: "Delhi",
        enquiryDate: "2026-11-27",
        travelStart: "2026-12-10",
        travelEnd: "2026-12-12",
        travellers: 2,
        budget: "10000",
        quotedPrice: "0",
        source: "Website",
        lostReason: stage === "Lost" ? "Historical closed lead" : "",
      });
      for (let i = 0; i < 2; i++)
        await mutate(f.owner, "lead", { lead: lead(`OWNER-${i}`, f.owner.id) });
      await mutate(f.owner, "lead", {
        lead: lead("CLOSED", f.manager.id, "Lost"),
      });
      await db.user.update({
        where: { id: f.agent.id },
        data: { disabled: true },
      });
      await mutate(f.owner, "lead", { lead: lead("AUTO", AUTO_ASSIGNEE) });
      const auto = await db.lead.findFirstOrThrow({
        where: { agencyId: f.agency.id, externalId: "AUTO" },
      });
      assert.equal(auto.assignedId, f.manager.id);
      const audit = await db.activity.findFirst({
        where: { agencyId: f.agency.id, leadId: auto.id },
      });
      assert.match(audit!.action, /automatically assigned/);
      await assert.rejects(
        mutate({ ...f.agent, role: "OWNER" }, "lead", {
          lead: lead("FORGED", AUTO_ASSIGNEE),
        }),
        /access unavailable|owner or manager/,
      );
      await assert.rejects(
        mutate(f.owner, "lead", {
          id: auto.id,
          lead: lead("AUTO", AUTO_ASSIGNEE),
        }),
        /only for one new enquiry/,
      );
      await assert.rejects(
        mutate(f.owner, "import", { rows: [lead("IMPORT", AUTO_ASSIGNEE)] }),
        /only for one new enquiry/,
      );
      assert.equal(
        await db.lead.count({ where: { agencyId: f.agency.id } }),
        4,
      );
    }));
  test(`${engine}: simultaneous automatic assignments select distinct available teammates without duplicate writes`, () =>
    scope(engine, async () => {
      const { mutate } = await import("../src/lib/actions");
      const { AUTO_ASSIGNEE } = await import("../src/lib/lead-assignment");
      const f = await fixture();
      const lead = (i: number) => ({
        externalId: `RACE-${i}`,
        assignedId: AUTO_ASSIGNEE,
        stage: "New",
        customer: "Concurrent Traveller",
        destination: "Delhi",
        enquiryDate: "2026-11-27",
        travelStart: "2026-12-10",
        travelEnd: "2026-12-12",
        travellers: 2,
        budget: "10000",
        quotedPrice: "0",
        source: "Website",
      });
      await Promise.all([
        mutate(f.owner, "lead", { lead: lead(1) }),
        mutate(f.owner, "lead", { lead: lead(2) }),
      ]);
      const rows = await db.lead.findMany({ where: { agencyId: f.agency.id } });
      assert.equal(rows.length, 2);
      assert.equal(new Set(rows.map((r) => r.assignedId)).size, 2);
      assert.ok(
        rows.every((r) =>
          [f.owner.id, f.agent.id, f.manager.id].includes(r.assignedId),
        ),
      );
    }));
}

test("automatic retry classification excludes unknown network outcomes and unrelated SQL failures", async () => {
  const { transactionConflict, uniqueConflict } =
    await import("../src/lib/db-conflicts");
  assert.equal(transactionConflict({ code: "P2034" }), true);
  assert.equal(
    transactionConflict({ code: "P2010", meta: { code: "40001" } }),
    true,
  );
  assert.equal(
    transactionConflict({ code: "P2010", meta: { code: "40P01" } }),
    true,
  );
  assert.equal(
    transactionConflict({ code: "P2010", meta: { code: "23505" } }),
    false,
  );
  assert.equal(
    uniqueConflict({ code: "P2010", meta: { code: "23505" } }),
    true,
  );
  for (const error of [
    new Error("request timeout"),
    new Error("40001 appeared in an unrelated message"),
    { code: "P2010", meta: { code: "23514" } },
    null,
  ])
    assert.equal(transactionConflict(error), false);
});

for (const engine of ["d1", "postgresql"] as const)
  test(`${engine}: database role constraints and fresh read permissions reject forged owner access`, () =>
    scope(engine, async () => {
      const { mutate } = await import("../src/lib/actions");
      const { workspaceData } = await import("../src/lib/data");
      const { scope: leadScope, writable } = await import("../src/lib/access");
      const f = await fixture();
      const agentView = await workspaceData({ ...f.agent, role: "OWNER" });
      assert.equal(agentView.actor.role, "AGENT");
      assert.equal(agentView.access.canViewCosts, false);
      await assert.rejects(
        db.user.update({ where: { id: f.owner.id }, data: { role: "VIEWER" } }),
        /role|constraint|CHECK/i,
      );
      assert.throws(
        () => leadScope({ ...f.owner, role: "VIEWER" }),
        /access unavailable/,
      );
      assert.throws(
        () => writable({ ...f.owner, role: "VIEWER" }),
        /access unavailable/,
      );
      await db.user.update({
        where: { id: f.owner.id },
        data: { role: "AGENT" },
      });
      const downgraded = await workspaceData({ ...f.owner, role: "OWNER" });
      assert.equal(downgraded.actor.role, "AGENT");
      assert.equal(downgraded.access.canViewCosts, false);
      await assert.rejects(
        mutate(f.owner, "lead", {
          lead: {
            externalId: "DENIED",
            assignedId: f.manager.id,
            stage: "New",
            customer: "Blocked Traveller",
            destination: "Delhi",
            enquiryDate: "2026-11-27",
            travelStart: "2026-12-10",
            travelEnd: "2026-12-12",
            travellers: 2,
            budget: "10000",
            quotedPrice: "0",
            source: "Website",
          },
        }),
        /permitted|themselves/,
      );
      await assert.rejects(
        supplierOverview(f.owner),
        /active owner or manager/,
      );
    }));
