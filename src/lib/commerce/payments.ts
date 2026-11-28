import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../http";
import { db } from "../db";
import { balances } from "../money";
import { providerJson } from "../integrations/provider-http";
import { guardedD1Batch } from "../d1/atomic";
import { commerceDb, hash, manager, managerGuard } from "./documents";
import { portalGrant } from "./portal";
const merchantSchema = z
  .object({
    agencyId: z.string().min(1).max(100),
    mode: z.enum(["TEST", "LIVE"]),
    keyId: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/),
    secret: z.string().min(12),
    webhookSecret: z.string().min(32),
    contractVersion: z.string().min(3).max(100),
    approved: z.literal(true),
  })
  .strict();
export function merchant(agencyId: string) {
  if (process.env.COMMERCE_PAYMENTS_ENABLED !== "true")
    throw new HttpError(
      503,
      "Online payments are not enabled. Contact your agency for payment options.",
    );
  let all: z.infer<typeof merchantSchema>[];
  try {
    all = z
      .array(merchantSchema)
      .min(1)
      .max(10)
      .parse(JSON.parse(process.env.COMMERCE_MERCHANTS_JSON || "[]"));
    if (new Set(all.map((v) => v.agencyId)).size !== all.length) throw Error();
  } catch {
    throw new HttpError(
      503,
      "The reviewed merchant configuration is incomplete",
    );
  }
  const m = all.find((v) => v.agencyId === agencyId);
  if (
    !m ||
    !m.keyId.startsWith(m.mode === "TEST" ? "rzp_test_" : "rzp_live_") ||
    (m.mode === "LIVE" &&
      process.env.COMMERCE_LIVE_PAYMENTS_APPROVED !== "true")
  )
    throw new HttpError(503, "Payments are not approved for this business");
  return m;
}
const orderSchema = z.object({
  id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  amount: z.number().int(),
  currency: z.literal("INR"),
  receipt: z.string(),
  status: z.string(),
  notes: z.object({ agencyId: z.string(), bookingId: z.string() }),
});
const paymentSchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  order_id: z.string(),
  amount: z.number().int(),
  currency: z.literal("INR"),
  status: z.string(),
  captured: z.boolean(),
  amount_refunded: z.number().int().min(0),
});
type Order = {
  id: string;
  agencyId: string;
  bookingId: string;
  requestId: string;
  payloadHash: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerKeyId: string;
  amount: number;
  mode: "TEST" | "LIVE";
  state: string;
};
async function provider(
  m: ReturnType<typeof merchant>,
  path: string,
  body: unknown,
  transport: typeof fetch,
) {
  if (!/^\/(orders|payments|refunds)(\/[A-Za-z0-9_]+)?$/.test(path))
    throw new Error("Invalid internal payment endpoint");
  return providerJson(
    "https://api.razorpay.com/v1" + path,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization:
          "Basic " + Buffer.from(m.keyId + ":" + m.secret).toString("base64"),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    transport,
  );
}
function publicOrder(o: Order) {
  return {
    id: o.id,
    state: o.state,
    orderId: o.providerOrderId,
    amount: o.amount,
    currency: "INR",
    mode: o.mode,
    keyId: o.providerKeyId,
  };
}
export async function createCustomerOrder(
  token: unknown,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  const g = await portalGrant(token),
    m = merchant(g.agencyId),
    b = commerceDb(),
    v = z.object({ requestId: z.string().uuid() }).strict().parse(input),
    payloadHash = hash(g.agencyId + ":" + g.bookingId + ":" + m.mode);
  const old = await b
    .prepare(
      "SELECT * FROM CommercePaymentOrder WHERE agencyId=? AND requestId=?",
    )
    .bind(g.agencyId, v.requestId)
    .first<Order>();
  if (old) {
    if (old.payloadHash !== payloadHash)
      throw new HttpError(409, "Payment request ID is already in use");
    return publicOrder(old);
  }
  const booking = await db.booking.findFirst({
    where: { id: g.bookingId, agencyId: g.agencyId },
    include: { transactions: true },
  });
  if (!booking || booking.status === "Cancelled")
    throw new HttpError(409, "Booking cannot accept this payment");
  const amount = balances(booking).customerDue;
  if (amount < 100)
    throw new HttpError(409, "No payable balance of at least ₹1 remains");
  const active = await b
    .prepare(
      "SELECT * FROM CommercePaymentOrder WHERE agencyId=? AND bookingId=? AND state IN ('CREATING','READY','UNKNOWN','REVIEW') ORDER BY createdAt DESC LIMIT 1",
    )
    .bind(g.agencyId, g.bookingId)
    .first<Order>();
  if (active) {
    if (
      active.state === "READY" &&
      active.mode === m.mode &&
      active.providerKeyId === m.keyId &&
      active.amount === amount
    )
      return publicOrder(active);
    throw new HttpError(
      409,
      "An earlier checkout needs agency reconciliation. Do not start another payment.",
    );
  }
  const id = randomUUID(),
    now = new Date().toISOString();
  await guardedD1Batch(
    b,
    [
      {
        sql: `SELECT COUNT(*)=0 FROM CommercePaymentOrder WHERE agencyId=? AND bookingId=? AND state IN ('CREATING','READY','UNKNOWN','REVIEW')`,
        values: [g.agencyId, g.bookingId],
      },
      {
        sql: `SELECT status!='Cancelled' AND total+COALESCE((SELECT SUM(CASE WHEN kind='Refund' THEN amount WHEN kind='Receipt' THEN -amount ELSE 0 END) FROM "Transaction" WHERE bookingId=? AND agencyId=?),0)=? FROM Booking WHERE id=? AND agencyId=?`,
        values: [g.bookingId, g.agencyId, amount, g.bookingId, g.agencyId],
      },
    ],
    [
      {
        sql: `INSERT INTO CommercePaymentOrder(id,agencyId,bookingId,requestId,payloadHash,providerKeyId,amount,mode,state,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,'CREATING',?,?)`,
        values: [
          id,
          g.agencyId,
          g.bookingId,
          v.requestId,
          payloadHash,
          m.keyId,
          amount,
          m.mode,
          now,
          now,
        ],
      },
    ],
  );
  try {
    const order = orderSchema.parse(
      await provider(
        m,
        "/orders",
        {
          amount,
          currency: "INR",
          receipt: id,
          notes: { agencyId: g.agencyId, bookingId: g.bookingId },
        },
        transport,
      ),
    );
    if (
      order.amount !== amount ||
      order.receipt !== id ||
      order.notes.agencyId !== g.agencyId ||
      order.notes.bookingId !== g.bookingId
    )
      throw Error("Provider order mismatch");
    await b
      .prepare(
        "UPDATE CommercePaymentOrder SET providerOrderId=?,state='READY',updatedAt=? WHERE id=? AND state='CREATING'",
      )
      .bind(order.id, new Date().toISOString(), id)
      .run();
    return publicOrder(
      (await b
        .prepare("SELECT * FROM CommercePaymentOrder WHERE id=?")
        .bind(id)
        .first<Order>())!,
    );
  } catch {
    await b
      .prepare(
        "UPDATE CommercePaymentOrder SET state='UNKNOWN',updatedAt=? WHERE id=? AND state='CREATING'",
      )
      .bind(new Date().toISOString(), id)
      .run();
    throw new HttpError(
      503,
      "Payment order result is uncertain. Do not start another payment; contact your agency to reconcile this request.",
    );
  }
}
export async function reconcileCapturedPayment(
  agencyId: string,
  providerPaymentId: string,
  transport: typeof fetch = fetch,
  expectedBookingId?: string,
) {
  if (!/^pay_[A-Za-z0-9]+$/.test(providerPaymentId))
    throw new HttpError(400, "Invalid payment reference");
  const m = merchant(agencyId),
    b = commerceDb(),
    p = paymentSchema.parse(
      await provider(m, "/payments/" + providerPaymentId, undefined, transport),
    );
  const ext = orderSchema.parse(
    await provider(m, "/orders/" + p.order_id, undefined, transport),
  );
  const o = await b
    .prepare("SELECT * FROM CommercePaymentOrder WHERE id=? AND agencyId=?")
    .bind(ext.receipt, agencyId)
    .first<Order>();
  if (
    !o ||
    (expectedBookingId && o.bookingId !== expectedBookingId) ||
    o.providerKeyId !== m.keyId ||
    o.mode !== m.mode ||
    o.amount !== p.amount ||
    ext.id !== p.order_id ||
    ext.amount !== o.amount ||
    ext.notes.agencyId !== agencyId ||
    ext.notes.bookingId !== o.bookingId ||
    (o.providerOrderId && o.providerOrderId !== p.order_id) ||
    p.id !== providerPaymentId
  )
    throw new HttpError(409, "Payment does not match the maintained checkout");
  if (o.state === "CAPTURED" || o.state === "REVIEW") {
    if (o.providerPaymentId !== p.id)
      throw new HttpError(
        409,
        "A different payment needs manual reconciliation",
      );
    return { state: o.state, replayed: true, mode: o.mode };
  }
  if (p.status !== "captured" || !p.captured)
    throw new HttpError(
      409,
      "Payment is not captured; no receipt or booking change was made",
    );
  const booking = await db.booking.findFirst({
      where: { id: o.bookingId, agencyId },
      include: { transactions: true },
    }),
    now = new Date().toISOString();
  const eligible =
    !!booking &&
    booking.status !== "Cancelled" &&
    p.amount_refunded === 0 &&
    balances(booking).customerDue >= o.amount;
  if (!eligible) {
    await b
      .prepare(
        "UPDATE CommercePaymentOrder SET providerOrderId=?,providerPaymentId=?,state='REVIEW',updatedAt=? WHERE id=? AND state NOT IN ('CAPTURED','REVIEW')",
      )
      .bind(p.order_id, p.id, now, o.id)
      .run();
    return { state: "REVIEW", mode: o.mode };
  }
  const guard = {
    sql: `SELECT COUNT(*)=1 FROM CommercePaymentOrder WHERE id=? AND state NOT IN ('CAPTURED','REVIEW')`,
    values: [o.id],
  };
  const writes: any[] = [
    {
      sql: "UPDATE CommercePaymentOrder SET providerOrderId=?,providerPaymentId=?,state='CAPTURED',updatedAt=? WHERE id=?",
      values: [p.order_id, p.id, now, o.id],
    },
  ];
  // Test captures NEVER become real CRM collections or change a booking.
  if (o.mode === "LIVE")
    writes.push({
      sql: `INSERT INTO "Transaction"(id,agencyId,bookingId,requestId,requestHash,kind,amount,supplier,memo,date,dateBasis,createdAt) VALUES(?,?,?,?,?,'Receipt',?,'',?,?,'INSTANT',?)`,
      values: [
        randomUUID(),
        agencyId,
        o.bookingId,
        "gateway:" + o.id,
        hash(p.id),
        o.amount,
        "Backend-verified Razorpay capture " + p.id,
        now,
        now,
      ],
    });
  await guardedD1Batch(
    b,
    [
      guard,
      {
        sql: `SELECT status!='Cancelled' AND total+COALESCE((SELECT SUM(CASE WHEN kind='Refund' THEN amount WHEN kind='Receipt' THEN -amount ELSE 0 END) FROM "Transaction" WHERE bookingId=? AND agencyId=?),0)>=? FROM Booking WHERE id=? AND agencyId=?`,
        values: [o.bookingId, agencyId, o.amount, o.bookingId, agencyId],
      },
    ],
    writes,
  );
  return { state: "CAPTURED", mode: o.mode };
}
export async function paymentWebhook(
  agencyId: string,
  raw: Uint8Array,
  signature: string,
  transport: typeof fetch = fetch,
) {
  const m = merchant(agencyId);
  if (
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(
        createHmac("sha256", m.webhookSecret).update(raw).digest("hex"),
        "hex",
      ),
    )
  )
    throw new HttpError(401, "Invalid payment webhook signature");
  const e = z
    .object({
      event: z.string(),
      payload: z.object({
        payment: z.object({ entity: z.object({ id: z.string() }) }).optional(),
        refund: z.object({ entity: z.object({ id: z.string() }) }).optional(),
      }),
    })
    .parse(JSON.parse(new TextDecoder().decode(raw)));
  if (e.event === "refund.processed") {
    if (!e.payload.refund) throw new HttpError(400, "Missing refund entity");
    return reconcileProviderRefund(
      agencyId,
      e.payload.refund.entity.id,
      transport,
    );
  }
  if (e.event !== "payment.captured") return { accepted: true, ignored: true };
  if (!e.payload.payment) throw new HttpError(400, "Missing payment entity");
  return reconcileCapturedPayment(
    agencyId,
    e.payload.payment.entity.id,
    transport,
  );
}

export async function reconcileProviderRefund(
  agencyId: string,
  refundId: string,
  transport: typeof fetch = fetch,
) {
  if (!/^rfnd_[A-Za-z0-9]+$/.test(refundId))
    throw new HttpError(400, "Invalid refund reference");
  const m = merchant(agencyId),
    b = commerceDb();
  const r = z
    .object({
      id: z.string(),
      payment_id: z.string(),
      amount: z.number().int().positive(),
      status: z.string(),
      currency: z.literal("INR"),
    })
    .parse(await provider(m, "/refunds/" + refundId, undefined, transport));
  if (r.id !== refundId || r.status !== "processed")
    throw new HttpError(409, "Refund is not processed");
  const p = paymentSchema.parse(
    await provider(m, "/payments/" + r.payment_id, undefined, transport),
  );
  const o = await b
    .prepare(
      "SELECT * FROM CommercePaymentOrder WHERE agencyId=? AND providerPaymentId=? AND providerOrderId=? AND state='CAPTURED'",
    )
    .bind(agencyId, r.payment_id, p.order_id)
    .first<Order>();
  if (
    !o ||
    o.mode !== m.mode ||
    o.providerKeyId !== m.keyId ||
    p.id !== r.payment_id ||
    p.amount !== o.amount ||
    p.amount_refunded < r.amount
  )
    throw new HttpError(409, "Refund does not match a verified checkout");
  const old = await b
    .prepare(
      "SELECT orderId,amount,state FROM CommercePaymentRefund WHERE id=?",
    )
    .bind(refundId)
    .first<{ orderId: string; amount: number; state: string }>();
  if (old) {
    if (old.orderId !== o.id || old.amount !== r.amount)
      throw new HttpError(409, "Refund reference mismatch");
    return { state: old.state, replayed: true };
  }
  const manual = await b
    .prepare(
      `SELECT COUNT(*) n FROM "Transaction" WHERE agencyId=? AND bookingId=? AND kind='Refund' AND (requestId IS NULL OR requestId NOT LIKE 'gatewayrefund:%')`,
    )
    .bind(agencyId, o.bookingId)
    .first<{ n: number }>();
  const review = o.mode === "LIVE" && !!manual?.n,
    now = new Date().toISOString();
  const guards = [
    {
      sql: "SELECT COALESCE(SUM(amount),0)+?<=? AND COALESCE(SUM(amount),0)+?<=? FROM CommercePaymentRefund WHERE orderId=?",
      values: [r.amount, o.amount, r.amount, p.amount_refunded, o.id],
    },
  ];
  const writes: any[] = [
    {
      sql: "INSERT INTO CommercePaymentRefund(id,orderId,amount,state,createdAt) VALUES(?,?,?,?,?)",
      values: [refundId, o.id, r.amount, review ? "REVIEW" : "RECORDED", now],
    },
  ];
  if (o.mode === "LIVE" && !review) {
    guards.push({
      sql: `SELECT COALESCE(SUM(CASE WHEN kind='Receipt' THEN amount WHEN kind='Refund' THEN -amount ELSE 0 END),0)>=? FROM "Transaction" WHERE agencyId=? AND bookingId=?`,
      values: [r.amount, agencyId, o.bookingId],
    });
    writes.push({
      sql: `INSERT INTO "Transaction"(id,agencyId,bookingId,requestId,requestHash,kind,amount,supplier,memo,date,dateBasis,createdAt) VALUES(?,?,?,?,?,'Refund',?,'',?,?,'INSTANT',?)`,
      values: [
        randomUUID(),
        agencyId,
        o.bookingId,
        "gatewayrefund:" + refundId,
        hash(refundId),
        r.amount,
        "Backend-verified Razorpay refund " + refundId,
        now,
        now,
      ],
    });
  }
  await guardedD1Batch(b, guards, writes);
  return { state: review ? "REVIEW" : "RECORDED", mode: o.mode };
}

export async function reconcileOrder(
  a: import("../access").Actor,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  await manager(a);
  const v = z
      .object({
        id: z.string().uuid(),
        orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
      })
      .strict()
      .parse(input),
    b = commerceDb(),
    m = merchant(a.agencyId);
  const o = await b
    .prepare("SELECT * FROM CommercePaymentOrder WHERE id=? AND agencyId=?")
    .bind(v.id, a.agencyId)
    .first<Order>();
  if (
    !o ||
    !["UNKNOWN", "CREATING", "READY"].includes(o.state) ||
    o.mode !== m.mode ||
    o.providerKeyId !== m.keyId
  )
    throw new HttpError(409, "Checkout cannot be reconciled in this state");
  const p = orderSchema.parse(
    await provider(m, "/orders/" + v.orderId, undefined, transport),
  );
  if (
    p.id !== v.orderId ||
    p.receipt !== o.id ||
    p.amount !== o.amount ||
    p.notes.agencyId !== a.agencyId ||
    p.notes.bookingId !== o.bookingId ||
    !["created", "attempted"].includes(p.status)
  )
    throw new HttpError(
      409,
      "Provider order mismatch or payment already processed. Reconcile its capture instead.",
    );
  await guardedD1Batch(
    b,
    [
      managerGuard(a),
      {
        sql: "SELECT COUNT(*)=1 FROM CommercePaymentOrder WHERE id=? AND state IN ('CREATING','READY','UNKNOWN')",
        values: [o.id],
      },
    ],
    [
      {
        sql: "UPDATE CommercePaymentOrder SET providerOrderId=?,state='READY',updatedAt=? WHERE id=?",
        values: [p.id, new Date().toISOString(), o.id],
      },
    ],
  );
  return {
    state: "READY",
    message: "Provider order verified. Customer can resume the same checkout.",
  };
}
