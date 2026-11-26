import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../access";
import { d1Binding } from "../db";
import { guardedD1Batch } from "../d1/atomic";
import { HttpError } from "../http";
import {
  digest,
  planHash,
  publicTestPlan,
  sandboxConfig,
  requireBillingPilot,
  type TestPlan,
} from "./config";
import {
  provider,
  verifyPlan,
  subscriptionSchema,
  subscriptionId,
} from "./provider";
export type TestCheckoutSummary = {
  id: string;
  state: string;
  planCode: string;
  amount: number;
  currency: string;
  providerSubscriptionId: string | null;
  createdAt: string;
};
export type TestReceiptSummary = {
  id: string;
  providerPaymentId: string;
  providerInvoiceId: string;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  verifiedAt: string;
  planCode: string;
  refunded: number;
};
export type Checkout = {
  id: string;
  agencyId: string;
  actorId: string;
  requestId: string;
  payloadHash: string;
  planCode: string;
  snapshot: string;
  amount: number;
  currency: string;
  providerKeyId: string;
  providerSubscriptionId: string | null;
  state: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export function billingDb() {
  const b = d1Binding();
  if (!b)
    throw new HttpError(
      503,
      "The billing sandbox requires native D1. Manual subscriptions remain available.",
    );
  return b;
}
export async function billingOwner(a: Actor) {
  const b = billingDb();
  const u = await b
    .prepare(
      'SELECT u.role,u.disabled,a.demo FROM "User" u JOIN "Agency" a ON a.id=u."agencyId" WHERE u.id=? AND u."agencyId"=?',
    )
    .bind(a.id, a.agencyId)
    .first<{ role: string; disabled: number; demo: number }>();
  if (!u || u.role !== "OWNER" || u.disabled || u.demo)
    throw new HttpError(
      403,
      "An enabled agency owner is required for test billing",
    );
  return b;
}
export const ownerGuard = (a: Actor) => ({
  sql: 'SELECT COUNT(*)=1 FROM "User" u JOIN "Agency" a ON a.id=u."agencyId" WHERE u.id=? AND u."agencyId"=? AND u.role=\'OWNER\' AND u.disabled=0 AND a.demo=0',
  values: [a.id, a.agencyId],
});
export async function checkoutById(id: string) {
  return billingDb()
    .prepare("SELECT * FROM SaaSTestCheckout WHERE id=?")
    .bind(id)
    .first<Checkout>();
}
export function checkoutResult(c: Checkout) {
  return {
    checkoutId: c.id,
    state: c.state,
    subscriptionId: c.providerSubscriptionId,
    amountPaise: c.amount,
    currency: c.currency,
    testMode: true,
    ...(c.state === "READY" ? { keyId: c.providerKeyId } : {}),
  };
}
export async function billingStatus(a: Actor) {
  if (!d1Binding())
    return {
      enabled: false,
      reason: "Test billing is unavailable on this runtime",
      plans: [],
      checkouts: [],
      receipts: [],
    };
  const b = await billingOwner(a);
  let config;
  try {
    config = sandboxConfig();
  } catch (e) {
    return {
      enabled: false,
      reason:
        e instanceof HttpError ? e.message : "Test configuration unavailable",
      plans: [],
      checkouts: [],
      receipts: [],
    };
  }
  if (!config.agencyIds.includes(a.agencyId))
    return {
      enabled: false,
      reason: "This agency is not in the billing test pilot",
      plans: [],
      checkouts: [],
      receipts: [],
    };
  const checkouts = (
    await b
      .prepare(
        "SELECT id,state,planCode,amount,currency,providerSubscriptionId,createdAt FROM SaaSTestCheckout WHERE agencyId=? ORDER BY createdAt DESC LIMIT 20",
      )
      .bind(a.agencyId)
      .all<TestCheckoutSummary>()
  ).results;
  const receipts = (
    await b
      .prepare(
        "SELECT p.id,p.providerPaymentId,p.providerInvoiceId,p.amount,p.currency,p.periodStart,p.periodEnd,p.verifiedAt,c.planCode,MAX(p.refundedAtVerification,COALESCE((SELECT SUM(r.amount) FROM SaaSTestRefund r WHERE r.paymentId=p.id AND r.agencyId=p.agencyId),0),COALESCE((SELECT MAX(r.observedTotal) FROM SaaSTestRefund r WHERE r.paymentId=p.id AND r.agencyId=p.agencyId),0)) AS refunded FROM SaaSTestPayment p JOIN SaaSTestCheckout c ON c.id=p.checkoutId AND c.agencyId=p.agencyId WHERE p.agencyId=? ORDER BY p.verifiedAt DESC LIMIT 40",
      )
      .bind(a.agencyId)
      .all<TestReceiptSummary>()
  ).results;
  return {
    enabled: true,
    reason:
      "Sandbox only. Verified test periods do not change production access or constitute a tax invoice.",
    plans: config.plans.map(publicTestPlan),
    checkouts,
    receipts,
  };
}
const createInput = z
  .object({
    requestId: z.uuid(),
    planCode: z.string().max(40),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
    acceptedTestTerms: z.literal(true),
  })
  .strict();
export async function createTestCheckout(
  a: Actor,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  const b = await billingOwner(a),
    v = createInput.parse(input),
    config = sandboxConfig(),
    plan = config.plans.find((p) => p.code === v.planCode);
  requireBillingPilot(config, a.agencyId);
  const payloadHash = digest(
    JSON.stringify({
      actorId: a.id,
      planCode: v.planCode,
      quoteHash: v.quoteHash,
      acceptedTestTerms: true,
    }),
  );
  const existing = await b
    .prepare("SELECT * FROM SaaSTestCheckout WHERE agencyId=? AND requestId=?")
    .bind(a.agencyId, v.requestId)
    .first<Checkout>();
  if (existing) {
    if (existing.providerKeyId !== config.keyId)
      throw new HttpError(
        409,
        "Test merchant changed. Review the recorded checkout before continuing.",
      );
    if (existing.payloadHash !== payloadHash)
      throw new HttpError(
        409,
        "Request key already used for different test terms",
      );
    return checkoutResult(existing);
  }
  if (!plan || planHash(plan) !== v.quoteHash)
    throw new HttpError(
      409,
      "Test price or terms changed. Reload and review the quote.",
    );
  await verifyPlan(config, plan, transport);
  const id = randomUUID(),
    now = new Date().toISOString();
  await guardedD1Batch(
    b,
    [
      ownerGuard(a),
      {
        sql: "SELECT NOT EXISTS(SELECT 1 FROM SaaSTestCheckout WHERE agencyId=? AND state IN('RESERVED','READY','UNKNOWN','SUBSCRIBED','HALTED'))",
        values: [a.agencyId],
      },
      {
        sql: "SELECT NOT EXISTS(SELECT 1 FROM SaaSTestPayment WHERE agencyId=? AND periodEnd>?)",
        values: [a.agencyId, now],
      },
    ],
    [
      {
        sql: "INSERT INTO SaaSTestCheckout (id,agencyId,actorId,requestId,payloadHash,planCode,snapshot,amount,currency,providerKeyId,state,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,'RESERVED',?,?)",
        values: [
          id,
          a.agencyId,
          a.id,
          v.requestId,
          payloadHash,
          plan.code,
          JSON.stringify(plan),
          plan.amountPaise,
          plan.currency,
          config.keyId,
          now,
          now,
        ],
      },
    ],
  );
  try {
    const sub = subscriptionSchema.parse(
      await provider(config, "/subscriptions", transport, {
        plan_id: plan.providerPlanId,
        total_count: plan.totalCycles,
        quantity: 1,
        customer_notify: 0,
        notes: { travelos_checkout: id, travelos_mode: "test" },
      }),
    );
    if (
      sub.plan_id !== plan.providerPlanId ||
      sub.notes.travelos_checkout !== id ||
      !["created", "authenticated"].includes(sub.status)
    )
      throw Error("Unconfirmed test subscription");
    await guardedD1Batch(
      b,
      [
        {
          sql: "SELECT COUNT(*)=1 FROM SaaSTestCheckout WHERE id=? AND state='RESERVED' AND providerSubscriptionId IS NULL",
          values: [id],
        },
      ],
      [
        {
          sql: "UPDATE SaaSTestCheckout SET providerSubscriptionId=?,state='READY',revision=revision+1,updatedAt=? WHERE id=?",
          values: [sub.id, new Date().toISOString(), id],
        },
      ],
    );
  } catch {
    await b
      .prepare(
        "UPDATE SaaSTestCheckout SET state='UNKNOWN',revision=revision+1,updatedAt=? WHERE id=? AND state='RESERVED'",
      )
      .bind(new Date().toISOString(), id)
      .run();
    throw new HttpError(
      503,
      "Test subscription creation could not be confirmed. Review its recorded checkout; do not create another subscription. Reconcile the provider ID first.",
    );
  }
  await billingOwner(a);
  return checkoutResult((await checkoutById(id))!);
}
const reconcileInput = z
  .object({ checkoutId: z.uuid(), subscriptionId })
  .strict();
export async function reconcileTestCheckout(
  a: Actor,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  const b = await billingOwner(a),
    v = reconcileInput.parse(input),
    c = await checkoutById(v.checkoutId),
    config = sandboxConfig();
  requireBillingPilot(config, a.agencyId);
  if (!c || c.agencyId !== a.agencyId)
    throw new HttpError(404, "Test checkout not found");
  if (c.providerKeyId !== config.keyId)
    throw new HttpError(
      409,
      "Test merchant changed. Operator reconciliation is required.",
    );
  if (c.providerSubscriptionId) {
    if (c.providerSubscriptionId !== v.subscriptionId)
      throw new HttpError(
        409,
        "Checkout is already bound to another provider subscription",
      );
    return checkoutResult(c);
  }
  if (!["UNKNOWN", "RESERVED"].includes(c.state))
    throw new HttpError(409, "Checkout is not awaiting reconciliation");
  const plan = JSON.parse(c.snapshot) as TestPlan;
  const sub = subscriptionSchema.parse(
    await provider(config, "/subscriptions/" + v.subscriptionId, transport),
  );
  if (
    sub.id !== v.subscriptionId ||
    sub.notes.travelos_checkout !== c.id ||
    sub.plan_id !== plan.providerPlanId ||
    ![
      "created",
      "authenticated",
      "active",
      "pending",
      "halted",
      "paused",
      "cancelled",
      "completed",
      "expired",
    ].includes(sub.status)
  )
    throw new HttpError(
      409,
      "Provider subscription does not match this recorded test checkout",
    );
  await billingOwner(a);
  const state = ["cancelled", "completed", "expired"].includes(sub.status)
    ? "CLOSED"
    : ["halted", "paused"].includes(sub.status)
      ? "HALTED"
      : sub.status === "active"
        ? "SUBSCRIBED"
        : "READY";
  await guardedD1Batch(
    b,
    [
      ownerGuard(a),
      {
        sql: "SELECT COUNT(*)=1 FROM SaaSTestCheckout WHERE id=? AND agencyId=? AND revision=? AND providerSubscriptionId IS NULL",
        values: [c.id, a.agencyId, c.revision],
      },
    ],
    [
      {
        sql: "UPDATE SaaSTestCheckout SET providerSubscriptionId=?,state=?,revision=revision+1,updatedAt=? WHERE id=?",
        values: [sub.id, state, new Date().toISOString(), c.id],
      },
    ],
  );
  return checkoutResult((await checkoutById(c.id))!);
}
export async function testReceipt(a: Actor, id: string) {
  const b = await billingOwner(a);
  z.uuid().parse(id);
  const row = await b
    .prepare(
      "SELECT p.*,c.snapshot FROM SaaSTestPayment p JOIN SaaSTestCheckout c ON c.id=p.checkoutId AND c.agencyId=p.agencyId WHERE p.id=? AND p.agencyId=?",
    )
    .bind(id, a.agencyId)
    .first<{
      id: string;
      providerPaymentId: string;
      providerInvoiceId: string;
      amount: number;
      currency: string;
      periodStart: string;
      periodEnd: string;
      verifiedAt: string;
      refundedAtVerification: number;
      snapshot: string;
    }>();
  if (!row) throw new HttpError(404, "Test receipt not found");
  const plan = JSON.parse(row.snapshot) as TestPlan;
  const adjustments = (
    await b
      .prepare(
        "SELECT providerRefundId,amount,observedTotal,verifiedAt FROM SaaSTestRefund WHERE paymentId=? AND agencyId=? ORDER BY verifiedAt LIMIT 101",
      )
      .bind(id, a.agencyId)
      .all()
  ).results;
  return {
    type: "SANDBOX_TEST_RECEIPT",
    notice:
      "Not a tax invoice or real-money receipt. No production subscription entitlement was changed.",
    id: row.id,
    plan: plan.label,
    termsVersion: plan.termsVersion,
    taxLabel: plan.taxLabel,
    cancellationTerms: plan.cancellationTerms,
    amountPaise: row.amount,
    currency: row.currency,
    providerPaymentId: row.providerPaymentId,
    providerInvoiceId: row.providerInvoiceId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    verifiedAt: row.verifiedAt,
    refundedAtVerification: row.refundedAtVerification,
    adjustments: adjustments.slice(0, 100),
    adjustmentsTruncated: adjustments.length > 100,
  };
}
