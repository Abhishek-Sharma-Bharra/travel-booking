import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { requestResources, closeResources } from "../src/lib/request-resources";
import { db } from "../src/lib/db";
import { mutate } from "../src/lib/actions";
import { workspaceData } from "../src/lib/data";
import { newD1Record, insertD1 } from "../src/lib/d1/unit";
import type { Actor } from "../src/lib/access";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "travelos-d1-crm-tests" },
  }),
);
let binding: D1Database;
const owner: Actor = { id: "owner", agencyId: "agency", role: "OWNER" };
const foreign: Actor = {
  id: "foreign-owner",
  agencyId: "foreign",
  role: "OWNER",
};
const agent: Actor = { id: "agent", agencyId: "agency", role: "AGENT" };
async function scoped<T>(fn: () => Promise<T>) {
  const resources = {
    databaseUrl: "",
    databaseEngine: "d1" as const,
    d1: binding,
    values: new Map<symbol, unknown>(),
    cleanup: [] as (() => Promise<void>)[],
  };
  return requestResources.run(resources, async () => {
    try {
      return await fn();
    } finally {
      await closeResources(resources);
    }
  });
}
const act = (actor: Actor, action: string, input: unknown) =>
  scoped(() => mutate(actor, action, input));
const run = async (model: string, data: Record<string, unknown>) => {
  const statement = insertD1(model, newD1Record(model, data));
  await binding
    .prepare(statement.sql)
    .bind(...(statement.values ?? []))
    .run();
};
const lead = (externalId: string, assignedId = owner.id) => ({
  externalId,
  customer: "D1 Traveller",
  email: "",
  phone: "",
  destination: "Kerala",
  enquiryDate: "2026-01-01",
  travelStart: "2026-12-01",
  travelEnd: "2026-12-05",
  travellers: 2,
  budget: "50000",
  quotedPrice: "0",
  source: "Website",
  assignedId,
  stage: "New",
});
const pkg = {
  name: "D1 Kerala",
  destination: "Kerala",
  days: 4,
  inclusions: "Hotel",
  exclusions: "Flight",
  price: "25000",
  estimatedCost: "15000",
};
let packageId: string, leadId: string, quoteId: string, bookingId: string;
before(async () => {
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  binding = await mf.getD1Database("DB");
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const file of (await readdir("cloudflare/d1/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile("cloudflare/d1/migrations/" + file, "utf8"),
      ).map((sql) => binding.prepare(sql)),
    );
  await run("Agency", { id: owner.agencyId, name: "D1 Agency" });
  await run("Agency", { id: foreign.agencyId, name: "Foreign" });
  await run("User", {
    id: owner.id,
    name: "Owner",
    email: "owner@test.invalid",
    emailVerified: true,
    agencyId: owner.agencyId,
  });
  await run("User", {
    id: foreign.id,
    name: "Foreign",
    email: "foreign@test.invalid",
    emailVerified: true,
    agencyId: foreign.agencyId,
  });
  await run("User", {
    id: agent.id,
    name: "Agent",
    email: "agent@test.invalid",
    emailVerified: true,
    agencyId: owner.agencyId,
    role: "AGENT",
  });
});
after(async () => {
  await mf.dispose();
});
test("D1 CRM creates packages and enquiries, and the existing Prisma workspace read model displays native writes", async () => {
  await act(owner, "package", pkg);
  await act(owner, "lead", { lead: lead("one") });
  await scoped(async () => {
    const data = await workspaceData(owner);
    assert.equal(data.leads.length, 1);
    assert.equal(data.packages.length, 1);
    assert.equal(data.agency.name, "D1 Agency");
    assert.equal(data.access.canWrite, true);
    leadId = data.leads[0].id;
    packageId = data.packages[0].id;
    assert.equal(data.leads[0].budget, 5000000);
    assert.ok(data.leads[0].travelStart instanceof Date);
  });
});
test("D1 quotations preserve snapshots and concurrent creates assign separate versions", async () => {
  const input = { leadId, packageId, discount: "0", tax: "0" };
  const quotes = await Promise.all([
    act(owner, "quote", input),
    act(owner, "quote", input),
  ]);
  assert.notEqual(quotes[0].quoteId, quotes[1].quoteId);
  quoteId = quotes[0].quoteId!;
  await scoped(async () => {
    const rows = await db.quote.findMany({
      where: { leadId },
      orderBy: { version: "asc" },
    });
    assert.deepEqual(
      rows.map((row) => row.version),
      [1, 2],
    );
    assert.equal(rows[0].total, 5000000);
    assert.equal(rows[0].estimatedCost, 3000000);
  });
});
test("D1 quote conversion is atomic, concurrent conversion creates one booking, and stale quotes are rejected", async () => {
  const results = await Promise.allSettled([
    act(owner, "accept", { id: quoteId, dueDate: "2026-12-01" }),
    act(owner, "accept", { id: quoteId, dueDate: "2026-12-01" }),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  bookingId = (
    results.find(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<{ bookingId: string }>
  ).value.bookingId;
  await scoped(async () => {
    assert.equal(await db.booking.count({ where: { leadId } }), 1);
    assert.equal(
      (await db.lead.findUniqueOrThrow({ where: { id: leadId } })).stage,
      "Won",
    );
    assert.equal(
      (await db.quote.findUniqueOrThrow({ where: { id: quoteId } })).status,
      "Accepted",
    );
  });
  await act(owner, "lead", { lead: lead("stale") });
  const staleLead = await scoped(() =>
    db.lead.findFirstOrThrow({ where: { externalId: "stale" } }),
  );
  const q = await act(owner, "quote", {
    leadId: staleLead.id,
    packageId,
    discount: "0",
    tax: "0",
  });
  await act(owner, "lead", {
    id: staleLead.id,
    lead: { ...lead("stale"), travellers: 3 },
  });
  await assert.rejects(
    act(owner, "accept", { id: q.quoteId, dueDate: "2026-12-01" }),
    /changed/,
  );
});
test("D1 concurrent receipts cannot overcollect; retry UUIDs are idempotent and mismatched replays fail", async () => {
  const first = {
    bookingId,
    kind: "Receipt",
    requestId: randomUUID(),
    amount: "30000",
    memo: "Recorded transfer",
    date: "2026-11-16",
  };
  const second = { ...first, requestId: randomUUID() };
  const results = await Promise.allSettled([
    act(owner, "transaction", first),
    act(owner, "transaction", second),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const successful = results[0].status === "fulfilled" ? first : second;
  const repeated = await act(owner, "transaction", successful);
  assert.match(repeated.message, /already recorded/);
  await assert.rejects(
    act(owner, "transaction", { ...successful, amount: "1" }),
    /different entry/,
  );
  await scoped(async () => {
    const entries = await db.transaction.findMany({ where: { bookingId } });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].amount, 3000000);
  });
});
test("D1 cancellation and refunds retain correct balances and supplier credits cannot exceed expenses", async () => {
  await act(owner, "booking", {
    id: bookingId,
    status: "Cancelled",
    supplierStatus: "Pending",
    cancellationFee: "5000",
  });
  await act(owner, "transaction", {
    bookingId,
    requestId: randomUUID(),
    kind: "Refund",
    amount: "25000",
    memo: "Cancellation refund",
    date: "2026-11-16",
  });
  await assert.rejects(
    act(owner, "transaction", {
      bookingId,
      requestId: randomUUID(),
      kind: "Refund",
      amount: "6000",
      memo: "Bad refund",
      date: "2026-11-16",
    }),
    /unrefunded/,
  );
  await assert.rejects(
    act(owner, "booking", {
      id: bookingId,
      status: "Confirmed",
      supplierStatus: "Pending",
      cancellationFee: "0",
    }),
    /final/,
  );
  await act(owner, "transaction", {
    bookingId,
    requestId: randomUUID(),
    kind: "Expense",
    amount: "1000",
    supplier: "Hotel",
    memo: "Invoice",
    date: "2026-11-16",
  });
  await assert.rejects(
    act(owner, "transaction", {
      bookingId,
      requestId: randomUUID(),
      kind: "Supplier credit",
      amount: "1001",
      supplier: "Hotel",
      memo: "Bad credit",
      date: "2026-11-16",
    }),
    /available/,
  );
});
test("D1 rejects cross-agency and unassigned access, forged actor roles, and disabled users", async () => {
  await assert.rejects(
    act(foreign, "followup", { id: leadId, date: "", note: "Attack" }),
    /not permitted/,
  );
  await assert.rejects(
    act(agent, "approve-quote", { id: quoteId }),
    /Draft|permitted/,
  );
  await assert.rejects(
    act({ ...agent, role: "OWNER" }, "package", pkg),
    /permission/,
  );
  await assert.rejects(
    act(foreign, "transaction", {
      bookingId,
      requestId: randomUUID(),
      kind: "Receipt",
      amount: "1",
      memo: "Attack",
      date: "2026-11-16",
    }),
    /not found/i,
  );
  await scoped(() =>
    db.user.update({ where: { id: agent.id }, data: { disabled: true } }),
  );
  await assert.rejects(
    act(agent, "lead", { lead: lead("disabled", agent.id) }),
    /unavailable/,
  );
});
test("D1 CSV import is all-or-nothing even with duplicate identifiers in later rows", async () => {
  const before = await scoped(() => db.lead.count());
  await assert.rejects(
    act(owner, "import", { rows: [lead("import-new"), lead("one")] }),
  );
  await scoped(async () => {
    assert.equal(await db.lead.count(), before);
    assert.equal(
      await db.lead.count({ where: { externalId: "import-new" } }),
      0,
    );
  });
  const result = await act(owner, "import", {
    rows: Array.from({ length: 100 }, (_, index) => lead(`bulk-${index}`)),
  });
  assert.match(result.message, /100 enquiry/);
});
test("D1 later audit failure rolls back the booking, quote acceptance and lead status together", async () => {
  await act(owner, "lead", { lead: lead("rollback") });
  const l = await scoped(() =>
    db.lead.findFirstOrThrow({ where: { externalId: "rollback" } }),
  );
  const q = await act(owner, "quote", {
    leadId: l.id,
    packageId,
    discount: "0",
    tax: "0",
  });
  await binding.exec(
    `CREATE TRIGGER fail_audit BEFORE INSERT ON "Activity" BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;`,
  );
  try {
    await assert.rejects(
      act(owner, "accept", { id: q.quoteId, dueDate: "2026-12-01" }),
    );
    await scoped(async () => {
      assert.equal(await db.booking.count({ where: { leadId: l.id } }), 0);
      assert.equal(
        (await db.quote.findUniqueOrThrow({ where: { id: q.quoteId } })).status,
        "Draft",
      );
      assert.equal(
        (await db.lead.findUniqueOrThrow({ where: { id: l.id } })).stage,
        "Quoted",
      );
    });
  } finally {
    await binding.exec("DROP TRIGGER fail_audit;");
  }
});

test("D1 analytics and BI retain calendar cohorts, actual payment totals, unavailable profits and tenant scope", async () => {
  const { kpiData } = await import("../src/lib/kpi-service");
  const { exportBiGroups } = await import("../src/lib/bi");
  await scoped(() =>
    db.booking.update({
      where: { id: bookingId },
      data: { createdAt: new Date("2026-11-16T04:00:00Z") },
    }),
  );
  const report = await scoped(() =>
    kpiData(owner, { from: "2026-11-16", to: "2026-11-16" }),
  );
  const values = Object.fromEntries(
    report.current.map((metric) => [metric.key, metric.value]),
  );
  assert.equal(values.gbv, 5000000);
  assert.equal(values.receipts, 3000000);
  assert.equal(values.refunds, 2500000);
  assert.equal(report.currency, "INR");
  assert.equal(report.financial, true);
  assert.equal(report.performance[0].contribution, null);
  assert.equal(report.trends[0].receipts, 3000000);
  assert.equal(report.trends[0].refunds, 2500000);
  assert.ok(
    exportBiGroups(report, ["gbv", "bookings"]).some(
      (row) => row.group === "Kerala",
    ),
  );
  const foreignReport = await scoped(() =>
    kpiData(foreign, { from: "2026-11-16", to: "2026-11-16" }),
  );
  assert.equal(foreignReport.performance.length, 0);
  await scoped(() =>
    db.user.update({ where: { id: agent.id }, data: { disabled: false } }),
  );
  const agentReport = await scoped(() =>
    kpiData(
      { ...agent, role: "OWNER" },
      { from: "2026-11-16", to: "2026-11-16" },
    ),
  );
  assert.equal(agentReport.financial, false);
  assert.equal("recordedCosts" in (agentReport.performance[0] ?? {}), false);
  await assert.rejects(
    scoped(() =>
      kpiData(agent, { from: "2026-11-16", to: "2026-11-16", agent: owner.id }),
    ),
    /only assigned/,
  );
});

test("D1 reporting preserves DST boundaries and distinguishes calendar receipts from payment instants", async () => {
  const { kpiData } = await import("../src/lib/kpi-service");
  await act(owner, "settings", {
    name: "D1 Agency",
    logo: "",
    contact: "",
    footer: "Thanks",
    timezone: "America/New_York",
  });
  await act(owner, "lead", { lead: lead("dst") });
  const l = await scoped(() =>
    db.lead.findFirstOrThrow({ where: { externalId: "dst" } }),
  );
  const q = await act(owner, "quote", {
    leadId: l.id,
    packageId,
    discount: "0",
    tax: "0",
  });
  const b = await act(owner, "accept", {
    id: q.quoteId,
    dueDate: "2026-12-01",
  });
  await scoped(async () => {
    await db.booking.update({
      where: { id: b.bookingId! },
      data: { createdAt: new Date("2026-03-08T07:30:00Z") },
    });
    await db.transaction.create({
      data: {
        agencyId: owner.agencyId,
        bookingId: b.bookingId!,
        kind: "Receipt",
        amount: 10000,
        dateBasis: "INSTANT",
        date: new Date("2026-03-09T03:30:00Z"),
      },
    });
    await db.transaction.create({
      data: {
        agencyId: owner.agencyId,
        bookingId: b.bookingId!,
        kind: "Receipt",
        amount: 20000,
        dateBasis: "CALENDAR",
        date: new Date("2026-03-09T00:00:00Z"),
      },
    });
  });
  const report = await scoped(() =>
    kpiData(owner, { from: "2026-03-08", to: "2026-03-08" }),
  );
  assert.equal(report.period.start, "2026-03-08T05:00:00.000Z");
  assert.equal(report.period.endExclusive, "2026-03-09T04:00:00.000Z");
  assert.equal(
    report.current.find((metric) => metric.key === "receipts")?.value,
    10000,
  );
  assert.equal(report.trends[0].receipts, 10000);
  const next = await scoped(() =>
    kpiData(owner, { from: "2026-03-09", to: "2026-03-09" }),
  );
  assert.equal(
    next.current.find((metric) => metric.key === "receipts")?.value,
    20000,
  );
});

test("D1 consent evidence and automation policies remain isolated, atomic and never send customer messages", async () => {
  const { recordConsent } = await import("../src/lib/messaging/service");
  const {
    saveAutomation,
    enqueueJob,
    claimJob,
    executeClaim,
    automationOverview,
  } = await import("../src/lib/automation/service");
  await scoped(() =>
    recordConsent(owner, {
      phone: "+919999000000",
      optedIn: true,
      evidence: "Fictional opt-in recorded for testing only",
    }),
  );
  await scoped(async () => {
    const consent = await db.messagingConsent.findFirstOrThrow({
      where: { agencyId: owner.agencyId },
    });
    assert.equal(consent.optedIn, true);
    assert.equal(
      await db.messagingConsentEvent.count({
        where: { agencyId: owner.agencyId },
      }),
      1,
    );
    assert.equal(await db.whatsAppNotification.count(), 0);
  });
  await binding.exec(
    `CREATE TRIGGER fail_consent_event BEFORE INSERT ON "MessagingConsentEvent" BEGIN SELECT RAISE(ABORT,'injected failure'); END;`,
  );
  try {
    await assert.rejects(
      scoped(() =>
        recordConsent(owner, {
          phone: "+919999000000",
          optedIn: false,
          evidence: "Fictional opt-out rollback test only",
        }),
      ),
    );
    await scoped(async () =>
      assert.equal(
        (
          await db.messagingConsent.findFirstOrThrow({
            where: { agencyId: owner.agencyId },
          })
        ).optedIn,
        true,
      ),
    );
  } finally {
    await binding.exec("DROP TRIGGER fail_consent_event;");
  }
  await assert.rejects(
    scoped(() =>
      recordConsent(agent, {
        phone: "+919999000000",
        optedIn: false,
        evidence: "Forbidden agent update attempt",
      }),
    ),
    /owner|Only/i,
  );
  await scoped(() =>
    saveAutomation(owner, {
      enabled: true,
      ads: false,
      reminders: false,
      notifications: false,
      summaries: false,
      alerts: true,
    }),
  );
  const first = await scoped(() =>
    enqueueJob(
      owner.agencyId,
      "INTEGRATION_ALERT",
      "native-queue",
      { day: "2026-11-16" },
      0,
    ),
  );
  const repeated = await scoped(() =>
    enqueueJob(
      owner.agencyId,
      "INTEGRATION_ALERT",
      "native-queue",
      { day: "2026-11-16" },
      0,
    ),
  );
  assert.equal(first.id, repeated.id);
  const claims = await Promise.all([
    scoped(() => claimJob()),
    scoped(() => claimJob()),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const job = claims.find(Boolean)!;
  assert.equal(
    (await scoped(() => executeClaim({ ...job, leaseToken: "obsolete" })))
      .status,
    "STALE",
  );
  const completed = await scoped(() => executeClaim(job));
  assert.equal(completed.status, "COMPLETE");
  const overview = await scoped(() => automationOverview(owner));
  assert.equal(overview.jobs[0].status, "COMPLETE");
  await scoped(() =>
    saveAutomation(owner, {
      enabled: false,
      ads: false,
      reminders: false,
      notifications: false,
      summaries: false,
      alerts: false,
    }),
  );
});

test("D1 invitation acceptance resets only onboarding, consumes the token and revokes old sessions atomically", async () => {
  const { acceptInvitation, tokenDigest } =
    await import("../src/lib/invitations");
  const token = "a".repeat(43),
    old = "invite-empty",
    user = "invite-user";
  await run("Agency", { id: old, name: "Empty new workspace" });
  await run("User", {
    id: user,
    name: "Invitee",
    email: "invitee@test.invalid",
    emailVerified: true,
    agencyId: old,
  });
  await run("TourProgress", {
    userId: user,
    agencyId: old,
    version: 1,
    role: "OWNER",
    step: 0,
    status: "SKIPPED",
  });
  await run("Session", {
    id: "invite-session",
    token: "fictional-session",
    userId: user,
    expiresAt: new Date(Date.now() + 86400000),
  });
  await run("Invitation", {
    agencyId: owner.agencyId,
    email: "invitee@test.invalid",
    role: "AGENT",
    tokenHash: tokenDigest(token),
    expiresAt: new Date(Date.now() + 86400000),
  });
  await assert.rejects(
    scoped(() => acceptInvitation(foreign.id, token)),
    /does not match/,
  );
  await scoped(() => acceptInvitation(user, token));
  await scoped(async () => {
    const joined = await db.user.findUniqueOrThrow({ where: { id: user } });
    assert.equal(joined.agencyId, owner.agencyId);
    assert.equal(joined.role, "AGENT");
    assert.equal(await db.agency.count({ where: { id: old } }), 0);
    assert.equal(await db.tourProgress.count({ where: { userId: user } }), 0);
    assert.equal(await db.session.count({ where: { userId: user } }), 0);
  });
  await assert.rejects(
    scoped(() => acceptInvitation(user, token)),
    /invalid|expired/,
  );
  const populated = "invite-populated",
    second = "invite-second",
    secondToken = "b".repeat(43);
  await run("Agency", {
    id: populated,
    name: "Workspace containing consent data",
  });
  await run("User", {
    id: second,
    name: "Second",
    email: "second@test.invalid",
    emailVerified: true,
    agencyId: populated,
  });
  await run("MessagingConsent", {
    agencyId: populated,
    phone: "+919999000001",
    optedIn: true,
  });
  await run("Invitation", {
    agencyId: owner.agencyId,
    email: "second@test.invalid",
    role: "AGENT",
    tokenHash: tokenDigest(secondToken),
    expiresAt: new Date(Date.now() + 86400000),
  });
  // Make room without changing any existing identities or business records.
  await act(owner, "team", { id: agent.id, role: "AGENT", disabled: true });
  await assert.rejects(
    scoped(() => acceptInvitation(second, secondToken)),
    /populated agency/,
  );
  await scoped(async () => {
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: second } })).agencyId,
      populated,
    );
    assert.equal(
      await db.messagingConsent.count({ where: { agencyId: populated } }),
      1,
    );
  });
});

test("D1 blocks unported provider and hotel entry points before network calls", async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    throw Error("No provider request should occur");
  };
  const ads = await import("../src/lib/integrations/service");
  const messaging = await import("../src/lib/messaging/service");
  const { requireHotels } = await import("../src/lib/hotels/service");
  const { receiveWhatsAppEvents } =
    await import("../src/lib/messaging/webhook");
  await scoped(async () => {
    await assert.rejects(
      ads.startAuthorization(owner, "META"),
      /not enabled on this D1 staging/,
    );
    await assert.rejects(
      ads.finishAuthorization(owner, "META", "state", "code", transport),
      /not enabled on this D1 staging/,
    );
    await assert.rejects(
      ads.syncAds(
        owner.agencyId,
        "connection",
        "2026-01-01",
        "2026-01-02",
        transport,
      ),
      /not enabled on this D1 staging/,
    );
    await assert.rejects(
      messaging.provisionChannel(
        owner.agencyId,
        "12345",
        "12345",
        "fictional",
        transport,
      ),
      /not enabled on this D1 staging/,
    );
    await assert.rejects(
      messaging.syncTemplates(owner, "channel", transport),
      /not enabled on this D1 staging/,
    );
    await assert.rejects(
      messaging.dispatchNotification(owner.agencyId, "notification", transport),
      /not enabled on this D1 staging/,
    );
    await assert.rejects(
      receiveWhatsAppEvents(new Uint8Array(), null),
      /not enabled on this D1 staging/,
    );
    const hotelFlag = process.env.HOTELS_ENABLED;
    process.env.HOTELS_ENABLED = "false";
    try {
      assert.throws(requireHotels, /Hotel module is not enabled/);
    } finally {
      if (hotelFlag === undefined) delete process.env.HOTELS_ENABLED;
      else process.env.HOTELS_ENABLED = hotelFlag;
    }
  });
  assert.equal(calls, 0);
});
