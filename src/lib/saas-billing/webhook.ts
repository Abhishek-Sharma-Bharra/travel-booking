import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../http";
import { guardedD1Batch, type D1Statement } from "../d1/atomic";
import { digest, sandboxConfig, type TestPlan } from "./config";
import {
  provider,
  subscriptionSchema,
  subscriptionId,
  paymentId,
  invoiceId,
  refundId,
} from "./provider";
import { billingDb, checkoutById, type Checkout } from "./service";
type Seen = { payloadHash: string };
type Payment = {
  id: string;
  agencyId: string;
  checkoutId: string;
  providerPaymentId: string;
  providerInvoiceId: string;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  refundedAtVerification: number;
};
export async function verifyTestWebhook(
  raw: Uint8Array,
  signature: string,
  eventId: string,
  transport: typeof fetch = fetch,
) {
  const config = sandboxConfig();
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(eventId) ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !timingSafeEqual(
      Buffer.from(
        createHmac("sha256", config.webhookSecret).update(raw).digest("hex"),
        "hex",
      ),
      Buffer.from(signature, "hex"),
    )
  )
    throw new HttpError(401, "Invalid test billing webhook signature");
  const b = billingDb(),
    hash = digest(raw);
  const seen = await b
    .prepare("SELECT payloadHash FROM SaaSTestWebhook WHERE eventId=?")
    .bind(eventId)
    .first<Seen>();
  if (seen) {
    if (seen.payloadHash !== hash)
      throw new HttpError(
        409,
        "Webhook event ID was reused with a different body",
      );
    return { accepted: true, replayed: true };
  }
  if (
    await b
      .prepare("SELECT eventId FROM SaaSTestWebhook WHERE payloadHash=?")
      .bind(hash)
      .first()
  )
    return { accepted: true, replayed: true };
  let event: { event: string; payload: Record<string, unknown> };
  try {
    event = z
      .object({
        event: z.string().max(100),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    throw new HttpError(400, "Invalid test billing webhook body");
  }
  const entity = (name: string) =>
    z
      .object({ entity: z.record(z.string(), z.unknown()) })
      .parse(event.payload[name]).entity;
  const stamp = new Date().toISOString(),
    writes: D1Statement[] = [],
    conditions: D1Statement[] = [];
  let c: Checkout | null = null;
  if (event.event === "refund.processed") {
    const r = z
      .object({ id: refundId, payment_id: paymentId })
      .parse(entity("refund"));
    const p = await b
      .prepare("SELECT * FROM SaaSTestPayment WHERE providerPaymentId=?")
      .bind(r.payment_id)
      .first<Payment>();
    if (!p) return { accepted: true, ignored: "UNTRACKED_TEST_PAYMENT" };
    c = await checkoutById(p.checkoutId);
    if (!c || c.providerKeyId !== config.keyId)
      throw new HttpError(409, "Recorded test merchant changed");
    const refund = z
      .object({
        id: refundId,
        payment_id: paymentId,
        amount: z.number().int().positive(),
        status: z.literal("processed"),
      })
      .parse(
        await provider(
          config,
          `/payments/${r.payment_id}/refunds/${r.id}`,
          transport,
        ),
      );
    if (
      refund.id !== r.id ||
      refund.payment_id !== p.providerPaymentId ||
      refund.amount > p.amount
    )
      throw new HttpError(
        409,
        "Refund does not match the verified test receipt",
      );
    const observed = z
      .object({
        id: paymentId,
        amount: z.number().int(),
        currency: z.literal("INR"),
        amount_refunded: z.number().int().nonnegative(),
      })
      .parse(await provider(config, "/payments/" + r.payment_id, transport));
    if (
      observed.id !== p.providerPaymentId ||
      observed.amount !== p.amount ||
      observed.currency !== p.currency ||
      observed.amount_refunded < refund.amount ||
      observed.amount_refunded > p.amount
    )
      throw new HttpError(
        409,
        "Refund totals conflict with the verified test payment",
      );
    const prior = await b
      .prepare(
        "SELECT paymentId,amount FROM SaaSTestRefund WHERE providerRefundId=?",
      )
      .bind(r.id)
      .first<{ paymentId: string; amount: number }>();
    if (prior) {
      if (prior.paymentId !== p.id || prior.amount !== refund.amount)
        throw new HttpError(
          409,
          "Refund reference conflicts with the test ledger",
        );
    } else {
      conditions.push({
        sql: "SELECT COALESCE(SUM(amount),0)+?<=? FROM SaaSTestRefund WHERE paymentId=?",
        values: [refund.amount, observed.amount_refunded, p.id],
      });
      writes.push({
        sql: "INSERT INTO SaaSTestRefund (id,agencyId,paymentId,providerRefundId,amount,verifiedAt,observedTotal) VALUES (?,?,?,?,?,?,?)",
        values: [
          randomUUID(),
          p.agencyId,
          p.id,
          r.id,
          refund.amount,
          stamp,
          observed.amount_refunded,
        ],
      });
    }
  } else if (
    event.event === "subscription.charged" ||
    [
      "subscription.activated",
      "subscription.cancelled",
      "subscription.completed",
      "subscription.halted",
      "subscription.paused",
      "subscription.resumed",
      "subscription.pending",
    ].includes(event.event)
  ) {
    const pointer = z
      .object({
        id: subscriptionId,
        notes: z.object({ travelos_checkout: z.string().uuid() }).optional(),
      })
      .parse(entity("subscription"));
    c = await b
      .prepare("SELECT * FROM SaaSTestCheckout WHERE providerSubscriptionId=?")
      .bind(pointer.id)
      .first<Checkout>();
    if (!c && pointer.notes)
      c = await checkoutById(pointer.notes.travelos_checkout);
    if (!c) return { accepted: true, ignored: "UNTRACKED_TEST_SUBSCRIPTION" };
    if (
      c.providerKeyId !== config.keyId ||
      (c.providerSubscriptionId && c.providerSubscriptionId !== pointer.id)
    )
      throw new HttpError(
        409,
        "Webhook subscription or test merchant conflicts with checkout",
      );
    const plan = JSON.parse(c.snapshot) as TestPlan;
    const sub = subscriptionSchema.parse(
      await provider(config, "/subscriptions/" + pointer.id, transport),
    );
    if (
      sub.id !== pointer.id ||
      sub.plan_id !== plan.providerPlanId ||
      sub.notes.travelos_checkout !== c.id
    )
      throw new HttpError(
        409,
        "Provider subscription does not match the frozen test checkout",
      );
    if (event.event === "subscription.charged") {
      const pointerPayment = z
        .object({ id: paymentId })
        .parse(entity("payment"));
      const p = z
        .object({
          id: paymentId,
          invoice_id: invoiceId,
          amount: z.number().int(),
          currency: z.literal("INR"),
          status: z.literal("captured"),
          captured: z.literal(true),
          amount_refunded: z.number().int().nonnegative().default(0),
        })
        .parse(
          await provider(config, "/payments/" + pointerPayment.id, transport),
        );
      const invoice = z
        .object({
          id: invoiceId,
          subscription_id: subscriptionId,
          payment_id: paymentId,
          status: z.literal("paid"),
          amount_paid: z.number().int(),
          amount_due: z.literal(0),
          currency: z.literal("INR"),
          billing_start: z.number().int().positive(),
          billing_end: z.number().int().positive(),
        })
        .parse(await provider(config, "/invoices/" + p.invoice_id, transport));
      const length = (invoice.billing_end - invoice.billing_start) / 86400;
      if (
        p.id !== pointerPayment.id ||
        p.amount !== c.amount ||
        p.amount_refunded > p.amount ||
        invoice.id !== p.invoice_id ||
        invoice.subscription_id !== sub.id ||
        invoice.payment_id !== p.id ||
        invoice.amount_paid !== c.amount ||
        invoice.billing_start > Date.now() / 1000 + 86400 ||
        invoice.billing_end > Date.now() / 1000 + 370 * 86400 ||
        (plan.period === "monthly"
          ? length < 25 || length > 35
          : length < 360 || length > 367)
      )
        throw new HttpError(
          409,
          "Provider payment, invoice, period or amount differs from the test quote",
        );
      const start = new Date(invoice.billing_start * 1000).toISOString(),
        end = new Date(invoice.billing_end * 1000).toISOString();
      const prior = await b
        .prepare("SELECT * FROM SaaSTestPayment WHERE providerPaymentId=?")
        .bind(p.id)
        .first<Payment>();
      if (prior) {
        if (
          prior.checkoutId !== c.id ||
          prior.providerInvoiceId !== invoice.id ||
          prior.amount !== c.amount ||
          prior.periodStart !== start ||
          prior.periodEnd !== end
        )
          throw new HttpError(
            409,
            "Payment reference conflicts with the immutable test ledger",
          );
      } else {
        conditions.push({
          sql: "SELECT NOT EXISTS(SELECT 1 FROM SaaSTestPayment WHERE checkoutId=? AND periodStart<? AND periodEnd>?)",
          values: [c.id, end, start],
        });
        writes.push({
          sql: "INSERT INTO SaaSTestPayment (id,agencyId,checkoutId,providerPaymentId,providerInvoiceId,amount,currency,periodStart,periodEnd,verifiedAt,refundedAtVerification) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          values: [
            randomUUID(),
            c.agencyId,
            c.id,
            p.id,
            invoice.id,
            c.amount,
            c.currency,
            start,
            end,
            stamp,
            p.amount_refunded,
          ],
        });
      }
    }
    const closed = ["cancelled", "completed", "expired"].includes(sub.status),
      halted = ["halted", "paused", "pending"].includes(sub.status);
    const target =
      c.state === "CLOSED" || closed
        ? "CLOSED"
        : halted
          ? "HALTED"
          : event.event === "subscription.charged" || sub.status === "active"
            ? "SUBSCRIBED"
            : "READY";
    writes.push({
      sql: "UPDATE SaaSTestCheckout SET providerSubscriptionId=?,state=?,revision=revision+1,updatedAt=? WHERE id=?",
      values: [sub.id, target, stamp, c.id],
    });
  } else return { accepted: true, ignored: "UNSUPPORTED_TEST_EVENT" };
  if (!c) throw new HttpError(409, "Test checkout is unavailable");
  conditions.push(
    {
      sql: "SELECT NOT EXISTS(SELECT 1 FROM SaaSTestWebhook WHERE eventId=?)",
      values: [eventId],
    },
    {
      sql: "SELECT COUNT(*)=1 FROM SaaSTestCheckout WHERE id=? AND revision=?",
      values: [c.id, c.revision],
    },
  );
  writes.push({
    sql: "INSERT INTO SaaSTestWebhook (eventId,payloadHash,eventType,checkoutId,createdAt) VALUES (?,?,?,?,?)",
    values: [eventId, hash, event.event, c.id, stamp],
  });
  try {
    await guardedD1Batch(b, conditions, writes);
  } catch (e) {
    const duplicate = await b
      .prepare("SELECT payloadHash FROM SaaSTestWebhook WHERE eventId=?")
      .bind(eventId)
      .first<Seen>();
    if (duplicate?.payloadHash === hash)
      return { accepted: true, replayed: true };
    throw e;
  }
  return { accepted: true, replayed: false, productionAccessChanged: false };
}
