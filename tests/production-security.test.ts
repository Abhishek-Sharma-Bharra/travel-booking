import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { mutate } from "../src/lib/actions";
import { auth } from "../src/lib/auth";
import { Actor } from "../src/lib/access";
import { workspaceData } from "../src/lib/data";
import { acceptInvitation, tokenDigest } from "../src/lib/invitations";
import { balances } from "../src/lib/money";
import { limitRequests } from "../src/lib/rate-limit";
import { jsonBody, HttpError, sameOrigin } from "../src/lib/http";
const prefix = "security-" + randomUUID();
let a: Actor, b: Actor, leadId: string, bookingId: string;
const messages: { to: string[]; text: string }[] = [];
const originalFetch = global.fetch;
const oldEnv = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM,
  SMTP_HOST: process.env.SMTP_HOST,
};
const lead = (uid: string, externalId: string) => ({
  externalId,
  customer: "Security Test Traveller",
  destination: "Kerala",
  enquiryDate: "2026-01-01",
  travelStart: "2026-02-01",
  travelEnd: "2026-02-04",
  travellers: 2,
  budget: "1000",
  quotedPrice: "1000",
  source: "Website",
  assignedId: uid,
  stage: "New",
});
before(async () => {
  process.env.RESEND_API_KEY = "fictional-test-key-never-sent";
  process.env.MAIL_FROM = "TravelOS Test <mail@test.invalid>";
  delete process.env.SMTP_HOST;
  global.fetch = (async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    messages.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "fictional-delivery" });
  }) as typeof fetch;
  for (const suffix of ["a", "b"]) {
    const agency = await db.agency.create({
      data: { name: prefix + "-" + suffix },
    });
    const u = await db.user.create({
      data: {
        id: prefix + "-" + suffix,
        name: prefix + "-" + suffix,
        email: prefix + suffix + "@test.invalid",
        agencyId: agency.id,
        role: "OWNER",
      },
    });
    const actor = { id: u.id, agencyId: agency.id, role: "OWNER" };
    if (suffix === "a") a = actor;
    else b = actor;
  }
  await mutate(a, "package", {
    name: "Security package",
    destination: "Kerala",
    days: 4,
    price: "1000",
    estimatedCost: "500",
    inclusions: "Stay",
    exclusions: "Flight",
  });
  await mutate(a, "lead", { lead: lead(a.id, "S-1") });
  await mutate(b, "lead", { lead: lead(b.id, "S-1") });
  const l = await db.lead.findFirstOrThrow({ where: { agencyId: a.agencyId } });
  leadId = l.id;
  const p = await db.package.findFirstOrThrow({
    where: { agencyId: a.agencyId },
  });
  await mutate(a, "quote", { leadId, packageId: p.id, discount: "0", tax: 0 });
  const q = await db.quote.findFirstOrThrow({ where: { leadId } });
  await mutate(a, "accept", { id: q.id, dueDate: "2026-01-25" });
  bookingId = (await db.booking.findUniqueOrThrow({ where: { leadId } })).id;
});
after(async () => {
  global.fetch = originalFetch;
  for (const [k, v] of Object.entries(oldEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const agencies = await db.agency.findMany({
    where: { name: { startsWith: prefix } },
  });
  for (const ag of agencies) {
    const agencyId = ag.id;
    await db.activity.deleteMany({ where: { agencyId } });
    await db.invitation.deleteMany({ where: { agencyId } });
    await db.transaction.deleteMany({ where: { agencyId } });
    await db.booking.deleteMany({ where: { agencyId } });
    await db.quote.deleteMany({ where: { agencyId } });
    await db.lead.deleteMany({ where: { agencyId } });
    await db.package.deleteMany({ where: { agencyId } });
    await db.spend.deleteMany({ where: { agencyId } });
    await db.user.deleteMany({ where: { agencyId } });
    await db.agency.delete({ where: { id: agencyId } });
  }
  await db.requestBucket.deleteMany({
    where: { key: createHash("sha256").update(prefix).digest("hex") },
  });
  await db.$disconnect();
});
test("production security and recovery boundaries", async (t) => {
  await t.test(
    "composite foreign keys reject tenant mismatches even through direct database writes",
    async () => {
      await assert.rejects(
        db.lead.create({
          data: {
            agencyId: a.agencyId,
            externalId: "SQL-ATTACK",
            customer: "Test attacker",
            destination: "Kerala",
            enquiryDate: new Date("2026-01-01"),
            travelStart: new Date("2026-02-01"),
            travelEnd: new Date("2026-02-02"),
            travellers: 2,
            budget: 1000,
            source: "Website",
            assignedId: b.id,
          },
        }),
        (e) => (e as { code?: string }).code === "P2003",
      );
      await assert.rejects(
        db.transaction.create({
          data: { agencyId: b.agencyId, bookingId, kind: "Receipt", amount: 1 },
        }),
        (e) => (e as { code?: string }).code === "P2003",
      );
    },
  );
  await t.test(
    "payment retry is idempotent and changed replay payloads are rejected",
    async () => {
      const v = {
        bookingId,
        requestId: randomUUID(),
        kind: "Receipt",
        amount: "100",
        date: "2026-01-02",
        memo: "Test receipt",
      };
      await mutate(a, "transaction", v);
      const again = await mutate(a, "transaction", v);
      assert.match(again.message, /already recorded/);
      assert.equal(
        await db.transaction.count({
          where: { agencyId: a.agencyId, requestId: v.requestId },
        }),
        1,
      );
      await assert.rejects(
        mutate(a, "transaction", { ...v, amount: "101" }),
        /different entry/,
      );
      await assert.rejects(
        mutate(a, "transaction", {
          bookingId,
          kind: "Receipt",
          amount: "1",
          date: "2026-01-02",
          memo: "Missing submission key",
        }),
      );
    },
  );
  await t.test(
    "paid supplier credits and refunds settle cash without double-counting costs",
    async () => {
      const entry = (kind: string, amount: string) =>
        mutate(a, "transaction", {
          bookingId,
          requestId: randomUUID(),
          kind,
          amount,
          date: "2026-01-03",
          memo: "Test supplier correction",
          supplier: "Test supplier",
        });
      await entry("Expense", "1000");
      await entry("Supplier payment", "1000");
      await entry("Supplier credit", "600");
      let bal = balances(
        await db.booking.findUniqueOrThrow({
          where: { id: bookingId },
          include: { transactions: true },
        }),
      );
      assert.equal(bal.supplierDue, -60000);
      assert.equal(bal.contribution, 160000);
      await assert.rejects(entry("Supplier refund", "601"), /available/);
      await entry("Supplier refund", "600");
      bal = balances(
        await db.booking.findUniqueOrThrow({
          where: { id: bookingId },
          include: { transactions: true },
        }),
      );
      assert.equal(bal.supplierDue, 0);
      assert.equal(bal.supplierPaid, 40000);
      assert.equal(bal.contribution, 160000);
    },
  );
  await t.test(
    "paused and expired agencies remain readable while business writes are blocked",
    async () => {
      await db.agency.update({
        where: { id: a.agencyId },
        data: { subscription: "Paused" },
      });
      assert.equal((await workspaceData(a)).leads.length, 1);
      await assert.rejects(
        mutate(a, "lead", { lead: lead(a.id, "PAUSED") }),
        /inactive/,
      );
      await db.agency.update({
        where: { id: a.agencyId },
        data: {
          subscription: "Trial",
          trialEndsAt: new Date(Date.now() - 1000),
        },
      });
      await assert.rejects(mutate(a, "package", {}), /inactive/);
      await db.agency.update({
        where: { id: a.agencyId },
        data: { trialEndsAt: new Date(Date.now() + 86400000) },
      });
    },
  );
  await t.test(
    "fresh database role overrides a forged owner actor",
    async () => {
      await db.user.update({ where: { id: a.id }, data: { role: "AGENT" } });
      await assert.rejects(
        mutate({ ...a, role: "OWNER" }, "settings", {
          name: "Forged owner",
          logo: "",
          contact: "",
          footer: "",
        }),
        /Only the owner/,
      );
      await db.user.update({ where: { id: a.id }, data: { role: "OWNER" } });
    },
  );
  await t.test(
    "invitations preserve populated workspaces, enforce recipient, revoke and consume only once",
    async () => {
      await mutate(a, "invite", {
        email: prefix + "b@test.invalid",
        role: "AGENT",
      });
      const text = messages.at(-1)!.text,
        token = new URL(
          text.match(/http[^\s]+\/join\?token=[^\s]+/)![0],
        ).searchParams.get("token")!;
      await assert.rejects(acceptInvitation(b.id, token), /populated agency/);
      const record = await db.invitation.findUniqueOrThrow({
        where: { tokenHash: tokenDigest(token) },
      });
      assert.notEqual(record.tokenHash, token);
      await mutate(a, "invite-revoke", { id: record.id });
      await assert.rejects(acceptInvitation(b.id, token), /invalid/);
      const email = prefix + "member@test.invalid";
      const newAccount = await auth.api.signUpEmail({
        body: {
          name: prefix + " Member",
          email,
          password: "Fictional-password-for-test-2026",
        },
      });
      await mutate(a, "invite", { email, role: "AGENT" });
      const valid = new URL(
        messages.at(-1)!.text.match(/http[^\s]+\/join\?token=[^\s]+/)![0],
      ).searchParams.get("token")!;
      await assert.rejects(acceptInvitation(b.id, valid), /does not match/);
      await acceptInvitation(newAccount.user.id, valid);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: newAccount.user.id } }))
          .agencyId,
        a.agencyId,
      );
      await assert.rejects(
        acceptInvitation(newAccount.user.id, valid),
        /invalid/,
      );
    },
  );
  await t.test(
    "pending invitations reserve seats and member reactivation respects plan limits",
    async () => {
      await mutate(a, "invite", {
        email: prefix + "pending@test.invalid",
        role: "MANAGER",
      });
      await assert.rejects(
        mutate(a, "invite", {
          email: prefix + "overflow@test.invalid",
          role: "AGENT",
        }),
        /team limit/,
      );
      const u = await db.user.create({
        data: {
          id: prefix + "-disabled",
          agencyId: a.agencyId,
          name: prefix + " Disabled",
          email: prefix + "disabled@test.invalid",
          role: "AGENT",
          disabled: true,
        },
      });
      await assert.rejects(
        mutate(a, "team", { id: u.id, role: "AGENT", disabled: false }),
        /team limit/,
      );
    },
  );
  await t.test("500-row CSV import uses the atomic bulk path", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => lead(b.id, `BULK-${i}`));
    await mutate(b, "import", { rows });
    assert.equal(
      await db.lead.count({
        where: { agencyId: b.agencyId, externalId: { startsWith: "BULK-" } },
      }),
      500,
    );
    await assert.rejects(
      mutate(b, "import", {
        rows: [lead(b.id, "NEW-WOULD-ROLL-BACK"), rows[0]],
      }),
    );
    assert.equal(
      await db.lead.count({
        where: { agencyId: b.agencyId, externalId: "NEW-WOULD-ROLL-BACK" },
      }),
      0,
    );
  });
  await t.test(
    "shared request limiter admits at most the configured number under concurrency",
    async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => limitRequests(prefix, 3)),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
      assert.equal(
        results.filter(
          (r) =>
            r.status === "rejected" && (r.reason as HttpError).status === 429,
        ).length,
        3,
      );
    },
  );
  await t.test(
    "disabled members cannot obtain new login sessions",
    async () => {
      const email = prefix + "member@test.invalid";
      const u = await db.user.findUniqueOrThrow({ where: { email } });
      await mutate(a, "team", { id: u.id, role: "AGENT", disabled: true });
      await assert.rejects(
        auth.api.signInEmail({
          body: { email, password: "Fictional-password-for-test-2026" },
        }),
        /disabled/i,
      );
      assert.equal(await db.session.count({ where: { userId: u.id } }), 0);
    },
  );
  await t.test("streamed request limits and CSRF fail closed", async () => {
    await assert.rejects(
      jsonBody(
        new Request("http://localhost:3000/api/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "x".repeat(100),
        }),
        50,
      ),
      (e) => (e as HttpError).status === 413,
    );
    assert.throws(
      () =>
        sameOrigin(
          new Request("http://localhost:3000/api/action", {
            headers: { Origin: "https://wrong.invalid" },
          }),
        ),
      (e) => (e as HttpError).status === 403,
    );
    await assert.rejects(
      jsonBody(
        new Request("http://localhost:3000/api/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{invalid",
        }),
      ),
      (e) => (e as HttpError).status === 400,
    );
  });
});
