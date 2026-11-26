import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { requestResources, closeResources } from "../src/lib/request-resources";
import { db } from "../src/lib/db";
import type { Actor } from "../src/lib/access";
import {
  createTestCheckout,
  reconcileTestCheckout,
  billingStatus,
  checkoutById,
  testReceipt,
} from "../src/lib/saas-billing/service";
import { verifyTestWebhook } from "../src/lib/saas-billing/webhook";
import {
  planHash,
  sandboxConfig,
  type TestPlan,
} from "../src/lib/saas-billing/config";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-11-16",
    d1Databases: { DB: "test-saas-billing" },
  }),
);
let binding: D1Database;
let legacy: { id: string; snapshot: string };
const entitlementSnapshot = (a: {
  plan: string;
  subscription: string;
  trialEndsAt: Date;
  subscriptionExpiresAt: Date | null;
}) =>
  JSON.stringify({
    plan: a.plan,
    subscription: a.subscription,
    trialEndsAt: a.trialEndsAt,
    subscriptionExpiresAt: a.subscriptionExpiresAt,
  });
const old = { ...process.env };
const secret = "fictional-test-key-secret-only",
  webhookSecret = "fictional-test-webhook-secret-2026-only";
const plan: TestPlan = {
  code: "fictional-monthly",
  label: "Fictional sandbox plan",
  appPlan: "Starter",
  providerPlanId: "plan_fixture",
  amountPaise: 10000,
  currency: "INR",
  period: "monthly",
  totalCycles: 12,
  termsVersion: "test-v1",
  taxLabel: "Fictional all-in test total; not a commercial offer",
  cancellationTerms:
    "Sandbox only. Existing real subscription terms are unchanged.",
};
function configure() {
  process.env.SAAS_BILLING_TEST_ENABLED = "true";
  process.env.SAAS_TEST_RAZORPAY_KEY_ID = "rzp_test_fixture";
  process.env.SAAS_TEST_RAZORPAY_KEY_SECRET = secret;
  process.env.SAAS_TEST_RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  process.env.SAAS_BILLING_TEST_CATALOG_JSON = JSON.stringify([plan]);
}
before(async () => {
  process.env.WRANGLER_LOG_PATH ||= ".local/cloudflare-logs";
  configure();
  binding = await mf.getD1Database("DB");
  const { unstable_splitSqlQuery } = await import("wrangler");
  for (const file of (await readdir("cloudflare/d1/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file.startsWith("0009_"))
      await scoped(async () => {
        const a = await owner();
        const saved = await db.agency.update({
          where: { id: a.agencyId },
          data: {
            plan: "Growth",
            subscription: "Active",
            subscriptionExpiresAt: new Date(Date.now() + 90 * 86400000),
          },
        });
        legacy = { id: a.agencyId, snapshot: entitlementSnapshot(saved) };
      });
    await binding.batch(
      unstable_splitSqlQuery(
        await readFile("cloudflare/d1/migrations/" + file, "utf8"),
      ).map((s) => binding.prepare(s)),
    );
  }
});
after(async () => {
  for (const key of [
    "SAAS_BILLING_TEST_ENABLED",
    "SAAS_BILLING_TEST_AGENCY_IDS",
    "SAAS_TEST_RAZORPAY_KEY_ID",
    "SAAS_TEST_RAZORPAY_KEY_SECRET",
    "SAAS_TEST_RAZORPAY_WEBHOOK_SECRET",
    "SAAS_BILLING_TEST_CATALOG_JSON",
  ]) {
    if (old[key] === undefined) delete process.env[key];
    else process.env[key] = old[key];
  }
  await mf.dispose();
});
async function scoped<T>(fn: () => Promise<T>) {
  const r = {
    databaseUrl: "",
    databaseEngine: "d1" as const,
    d1: binding,
    values: new Map<symbol, unknown>(),
    cleanup: [] as (() => Promise<void>)[],
  };
  return requestResources.run(r, async () => {
    process.env.SAAS_BILLING_TEST_AGENCY_IDS = "";
    configure();
    try {
      return await fn();
    } finally {
      await closeResources(r);
    }
  });
}
async function owner() {
  const agency = await db.agency.create({
      data: { name: "Fictional test billing agency" },
    }),
    user = await db.user.create({
      data: {
        id: randomUUID(),
        agencyId: agency.id,
        role: "OWNER",
        name: "Test Owner",
        email: randomUUID() + "@test.invalid",
        emailVerified: true,
      },
    });
  process.env.SAAS_BILLING_TEST_AGENCY_IDS = [
    process.env.SAAS_BILLING_TEST_AGENCY_IDS,
    agency.id,
  ]
    .filter(Boolean)
    .join(",");
  return { id: user.id, agencyId: agency.id, role: "OWNER" } satisfies Actor;
}
const request = () => ({
  requestId: randomUUID(),
  planCode: plan.code,
  quoteHash: planHash(plan),
  acceptedTestTerms: true,
});
class FakeRazorpay {
  posts = 0;
  calls = 0;
  loseCreation = false;
  wrongPlan = false;
  subs = new Map<string, any>();
  payments = new Map<string, any>();
  invoices = new Map<string, any>();
  refunds = new Map<string, any>();
  lastId = "";
  fetch: typeof fetch = async (input, init) => {
    this.calls++;
    const url = String(input);
    assert.match(url, /^https:\/\/api\.razorpay\.com\/v1\//);
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Basic " + Buffer.from("rzp_test_fixture:" + secret).toString("base64"),
    );
    const path = new URL(url).pathname.replace("/v1", "");
    let body: unknown;
    if (path === "/plans/" + plan.providerPlanId)
      body = {
        id: plan.providerPlanId,
        period: plan.period,
        interval: 1,
        item: {
          amount: this.wrongPlan ? plan.amountPaise + 1 : plan.amountPaise,
          currency: "INR",
        },
      };
    else if (path === "/subscriptions" && init?.method === "POST") {
      this.posts++;
      const sent = JSON.parse(String(init.body));
      assert.equal(sent.customer_notify, 0);
      assert.equal(sent.quantity, 1);
      assert.equal(sent.total_count, 12);
      const id = "sub_" + randomUUID().replaceAll("-", "");
      this.lastId = id;
      body = {
        id,
        plan_id: sent.plan_id,
        status: "created",
        notes: sent.notes,
      };
      this.subs.set(id, body);
      if (this.loseCreation) throw Error("Lost provider response");
    } else if (path.startsWith("/subscriptions/"))
      body = this.subs.get(path.slice(15));
    else if (path.includes("/refunds/"))
      body = this.refunds.get(path.split("/").at(-1)!);
    else if (path.startsWith("/payments/"))
      body = this.payments.get(path.slice(10));
    else if (path.startsWith("/invoices/"))
      body = this.invoices.get(path.slice(10));
    if (!body)
      return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    return Response.json(body);
  };
  payment(subId: string, shiftDays = 0) {
    const sub = this.subs.get(subId);
    sub.status = "active";
    const id = "pay_" + randomUUID().replaceAll("-", ""),
      invoice = "inv_" + randomUUID().replaceAll("-", "");
    const start = Math.floor(Date.now() / 1000) - 3600 + shiftDays * 86400;
    const p = {
      id,
      invoice_id: invoice,
      amount: plan.amountPaise,
      currency: "INR",
      status: "captured",
      captured: true,
      amount_refunded: 0,
    };
    this.payments.set(id, p);
    this.invoices.set(invoice, {
      id: invoice,
      subscription_id: subId,
      payment_id: id,
      status: "paid",
      amount_paid: plan.amountPaise,
      amount_due: 0,
      currency: "INR",
      billing_start: start,
      billing_end: start + 30 * 86400,
    });
    return p;
  }
  event(subId: string, payment?: any, event = "subscription.charged") {
    const sub = this.subs.get(subId);
    return {
      event,
      payload: {
        subscription: { entity: { id: subId, notes: sub.notes } },
        ...(payment ? { payment: { entity: { id: payment.id } } } : {}),
      },
    };
  }
  refund(payment: any, amount: number) {
    payment.amount_refunded += amount;
    const id = "rfnd_" + randomUUID().replaceAll("-", "");
    this.refunds.set(id, {
      id,
      payment_id: payment.id,
      amount,
      status: "processed",
    });
    return {
      event: "refund.processed",
      payload: { refund: { entity: { id, payment_id: payment.id } } },
    };
  }
}
const signed = (body: unknown) => {
  const raw = new TextEncoder().encode(JSON.stringify(body));
  return {
    raw,
    signature: createHmac("sha256", webhookSecret).update(raw).digest("hex"),
  };
};
async function deliver(fake: FakeRazorpay, body: unknown, id = randomUUID()) {
  const { raw, signature } = signed(body);
  return verifyTestWebhook(raw, signature, id, fake.fetch);
}

test("billing sandbox fails closed with absent catalogue, live keys, non-owners, disabled/demo users and foreign scopes", () =>
  scoped(async () => {
    const a = await owner(),
      f = new FakeRazorpay();
    const allowed = process.env.SAAS_BILLING_TEST_AGENCY_IDS;
    process.env.SAAS_BILLING_TEST_AGENCY_IDS = "another-pilot";
    assert.equal((await billingStatus(a)).enabled, false);
    await assert.rejects(
      createTestCheckout(a, request(), f.fetch),
      /not enabled for this agency/,
    );
    process.env.SAAS_BILLING_TEST_AGENCY_IDS = allowed;
    process.env.SAAS_BILLING_TEST_ENABLED = "false";
    assert.equal((await billingStatus(a)).enabled, false);
    await assert.rejects(createTestCheckout(a, request(), f.fetch), /disabled/);
    configure();
    process.env.SAAS_TEST_RAZORPAY_KEY_ID = "rzp_live_notallowed";
    assert.throws(sandboxConfig, /Live keys/);
    configure();
    process.env.SAAS_BILLING_TEST_CATALOG_JSON = "[]";
    assert.equal((await billingStatus(a)).enabled, false);
    configure();
    await db.user.update({ where: { id: a.id }, data: { role: "AGENT" } });
    await assert.rejects(
      createTestCheckout(a, request(), f.fetch),
      /agency owner/,
    );
    await db.user.update({
      where: { id: a.id },
      data: { role: "OWNER", disabled: true },
    });
    await assert.rejects(billingStatus(a), /agency owner/);
    await db.user.update({ where: { id: a.id }, data: { disabled: false } });
    await db.agency.update({ where: { id: a.agencyId }, data: { demo: true } });
    await assert.rejects(
      createTestCheckout(a, request(), f.fetch),
      /agency owner/,
    );
    assert.equal(f.calls, 0);
  }));

test("checkout reserves once under concurrency, freezes test terms, rejects stale quotes and never updates production entitlements", () =>
  scoped(async () => {
    const a = await owner(),
      f = new FakeRazorpay(),
      v = request();
    const initial = await db.agency.findUniqueOrThrow({
      where: { id: a.agencyId },
    });
    await assert.rejects(
      createTestCheckout(a, { ...v, quoteHash: "0".repeat(64) }, f.fetch),
      /terms changed/,
    );
    assert.equal(f.calls, 0);
    f.wrongPlan = true;
    await assert.rejects(
      createTestCheckout(a, v, f.fetch),
      /Provider plan differs/,
    );
    assert.equal(f.posts, 0);
    f.wrongPlan = false;
    const concurrent = await Promise.allSettled([
      createTestCheckout(a, v, f.fetch),
      createTestCheckout(a, v, f.fetch),
    ]);
    assert.ok(concurrent.some((x) => x.status === "fulfilled"));
    assert.equal(f.posts, 1);
    const good = concurrent.find(
      (x) => x.status === "fulfilled",
    ) as PromiseFulfilledResult<Awaited<ReturnType<typeof createTestCheckout>>>;
    assert.equal(good.value.state, "READY");
    assert.equal(
      (await createTestCheckout(a, v, f.fetch)).checkoutId,
      good.value.checkoutId,
    );
    assert.equal(f.posts, 1);
    process.env.SAAS_BILLING_TEST_CATALOG_JSON = JSON.stringify([
      { ...plan, amountPaise: 20000, termsVersion: "test-v2" },
    ]);
    assert.equal((await createTestCheckout(a, v, f.fetch)).amountPaise, 10000);
    configure();
    await assert.rejects(
      createTestCheckout(a, { ...v, quoteHash: "f".repeat(64) }, f.fetch),
      /different test terms/,
    );
    await assert.rejects(
      binding
        .prepare("UPDATE SaaSTestCheckout SET amount=12345 WHERE id=?")
        .bind(good.value.checkoutId)
        .run(),
      /immutable/,
    );
    const final = await db.agency.findUniqueOrThrow({
      where: { id: a.agencyId },
    });
    assert.equal(final.plan, initial.plan);
    assert.equal(final.subscription, initial.subscription);
    assert.equal(+final.trialEndsAt, +initial.trialEndsAt);
    assert.equal((await billingStatus(a)).receipts.length, 0);
  }));

test("unknown provider creation is retained without recreation and reconciliation requires the original scoped provider reference", () =>
  scoped(async () => {
    const a = await owner(),
      other = await owner(),
      f = new FakeRazorpay(),
      v = request();
    f.loseCreation = true;
    await assert.rejects(
      createTestCheckout(a, v, f.fetch),
      /could not be confirmed/,
    );
    const status = await billingStatus(a);
    const c = status.checkouts[0];
    assert.equal(c.state, "UNKNOWN");
    assert.equal((await createTestCheckout(a, v, f.fetch)).state, "UNKNOWN");
    assert.equal(f.posts, 1);
    await assert.rejects(
      reconcileTestCheckout(
        other,
        { checkoutId: c.id, subscriptionId: f.lastId },
        f.fetch,
      ),
      /not found/,
    );
    const sub = f.subs.get(f.lastId);
    sub.notes.travelos_checkout = randomUUID();
    await assert.rejects(
      reconcileTestCheckout(
        a,
        { checkoutId: c.id, subscriptionId: f.lastId },
        f.fetch,
      ),
      /does not match/,
    );
    sub.notes.travelos_checkout = c.id;
    assert.equal(
      (
        await reconcileTestCheckout(
          a,
          { checkoutId: c.id, subscriptionId: f.lastId },
          f.fetch,
        )
      ).state,
      "READY",
    );
    assert.equal(f.posts, 1);
  }));

test("signed payment verification checks independent amount/invoice/subscription bindings and deduplicates event IDs, content and payments", () =>
  scoped(async () => {
    const a = await owner(),
      other = await owner(),
      f = new FakeRazorpay(),
      c = await createTestCheckout(a, request(), f.fetch),
      p = f.payment(c.subscriptionId!);
    const event = f.event(c.subscriptionId!, p),
      { raw, signature } = signed(event);
    await assert.rejects(
      verifyTestWebhook(raw, "0".repeat(64), randomUUID(), f.fetch),
      /signature/,
    );
    const original = p.amount;
    p.amount++;
    await assert.rejects(deliver(f, event), /amount|quote/);
    p.amount = original;
    const invoice = f.invoices.get(p.invoice_id);
    invoice.subscription_id = "sub_foreign";
    await assert.rejects(deliver(f, event), /differs/);
    invoice.subscription_id = c.subscriptionId;
    const id = randomUUID();
    await deliver(f, event, id);
    assert.equal((await deliver(f, event, id)).replayed, true);
    assert.equal((await deliver(f, event)).replayed, true);
    await assert.rejects(
      deliver(f, { ...event, extra: "changed" }, id),
      /different body/,
    );
    const status = await billingStatus(a);
    assert.equal(status.receipts.length, 1);
    assert.equal(status.receipts[0].amount, 10000);
    assert.equal((await billingStatus(other)).receipts.length, 0);
    const receipt = await testReceipt(a, status.receipts[0].id);
    assert.equal(receipt.type, "SANDBOX_TEST_RECEIPT");
    assert.equal(receipt.amountPaise, 10000);
    assert.ok(!JSON.stringify(receipt).includes(secret));
    await assert.rejects(
      testReceipt(other, status.receipts[0].id),
      /not found/,
    );
    assert.equal(
      (await db.agency.findUniqueOrThrow({ where: { id: a.agencyId } }))
        .subscription,
      "Trial",
    );
    await assert.rejects(
      binding
        .prepare("DELETE FROM SaaSTestPayment WHERE id=?")
        .bind(status.receipts[0].id)
        .run(),
      /immutable/,
    );
  }));

test("failed/cancelled subscription events preserve prior test periods, late charges cannot reopen closed checkout, and refunds append once", () =>
  scoped(async () => {
    const a = await owner(),
      f = new FakeRazorpay(),
      c = await createTestCheckout(a, request(), f.fetch),
      sub = f.subs.get(c.subscriptionId!);
    sub.status = "halted";
    await deliver(f, f.event(sub.id, undefined, "subscription.halted"));
    assert.equal((await checkoutById(c.checkoutId))?.state, "HALTED");
    assert.equal((await billingStatus(a)).receipts.length, 0);
    const p = f.payment(sub.id);
    await deliver(f, f.event(sub.id, p));
    sub.status = "cancelled";
    await deliver(f, f.event(sub.id, undefined, "subscription.cancelled"));
    assert.equal((await checkoutById(c.checkoutId))?.state, "CLOSED");
    // Another signed notification for the same payment keeps the original paid period and sticky closed state.
    const changed = f.event(sub.id, p);
    changed.payload.subscription.entity.notes = { ...sub.notes };
    await deliver(f, { ...changed, late: true });
    assert.equal((await checkoutById(c.checkoutId))?.state, "CLOSED");
    const refund = f.refund(p, 2500);
    await deliver(f, refund);
    await deliver(f, refund);
    const status = await billingStatus(a);
    assert.equal(status.receipts.length, 1);
    assert.equal(status.receipts[0].refunded, 2500);
    assert.equal(
      (await testReceipt(a, status.receipts[0].id)).adjustments.length,
      1,
    );
    const excessive = f.refund(p, 9000);
    await assert.rejects(deliver(f, excessive), /conflict|changed/);
    assert.equal((await billingStatus(a)).receipts[0].refunded, 2500);
    assert.equal(
      (await db.agency.findUniqueOrThrow({ where: { id: a.agencyId } }))
        .subscription,
      "Trial",
    );
  }));

test("late already-refunded payments stay labelled for review and overlapping captured periods do not double-credit", () =>
  scoped(async () => {
    const a = await owner(),
      f = new FakeRazorpay(),
      c = await createTestCheckout(a, request(), f.fetch),
      p = f.payment(c.subscriptionId!);
    p.amount_refunded = 5000;
    await deliver(f, f.event(c.subscriptionId!, p));
    assert.equal((await billingStatus(a)).receipts[0].refunded, 5000);
    await deliver(f, f.refund(p, 2500));
    assert.equal((await billingStatus(a)).receipts[0].refunded, 7500);
    const second = f.payment(c.subscriptionId!);
    await assert.rejects(
      deliver(f, f.event(c.subscriptionId!, second)),
      /conflicts|changed/,
    );
    assert.equal((await billingStatus(a)).receipts.length, 1);
  }));

test("recurring verified test periods preserve their own dates and original terms after catalogue changes", () =>
  scoped(async () => {
    const a = await owner(),
      f = new FakeRazorpay(),
      c = await createTestCheckout(a, request(), f.fetch);
    const past = f.payment(c.subscriptionId!, -30);
    await deliver(f, f.event(c.subscriptionId!, past));
    process.env.SAAS_BILLING_TEST_CATALOG_JSON = JSON.stringify([
      { ...plan, amountPaise: 20000, termsVersion: "new-test-terms" },
    ]);
    const current = f.payment(c.subscriptionId!);
    await deliver(f, f.event(c.subscriptionId!, current));
    const status = await billingStatus(a);
    assert.equal(status.receipts.length, 2);
    assert.ok(status.receipts.every((r) => r.amount === 10000));
    assert.ok(new Set(status.receipts.map((r) => r.periodStart)).size === 2);
    assert.equal(
      (await testReceipt(a, status.receipts[0].id)).termsVersion,
      "test-v1",
    );
    const serialised = JSON.stringify(status);
    assert.ok(!serialised.includes(secret));
    assert.ok(!serialised.includes(webhookSecret));
    const agency = await db.agency.findUniqueOrThrow({
      where: { id: a.agencyId },
    });
    assert.equal(agency.subscription, "Trial");
    assert.equal(agency.subscriptionExpiresAt, null);
  }));

test("additive sandbox migration preserves an existing paid agency's plan, status and expiry", () =>
  scoped(async () => {
    assert.ok(legacy?.id);
    const row = await db.agency.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.equal(entitlementSnapshot(row), legacy.snapshot);
  }));
