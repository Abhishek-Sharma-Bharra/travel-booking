import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { d1Binding } from "../db";
import { HttpError } from "../http";
import { D1Unit } from "../d1/unit";
import { seal, unseal } from "../integrations/vault";
import { providerJson, ProviderError } from "../integrations/provider-http";
import { hotelUnit, ownedHotel, hotelAudit } from "./d1-foundation";
import { hash, requireHotelBooking, hotelStayStatus } from "./booking";
type Merchant = {
  id: string;
  hotelId: string;
  keyId: string;
  credentials: string;
  mode: "test" | "live";
  revision: number;
};
type Attempt = {
  id: string;
  hotelId: string;
  stayId: string;
  merchantId: string;
  merchantRevision: number;
  receipt: string;
  orderId: string | null;
  paymentId: string | null;
  amount: number;
  currency: string;
  status: string;
};
type Stay = {
  id: string;
  hotelId: string;
  secretHash: string;
  total: number;
  status: string;
  paymentStatus: string;
  holdUntil: string;
  revision: number;
};
const credentialContext = (m: Pick<Merchant, "id" | "hotelId">) =>
  `hotel-payment:${m.hotelId}:${m.id}`;
const signatureValid = (expected: string, received: string) =>
  /^[a-f0-9]{64}$/i.test(received) &&
  timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
async function merchant(hotelId: string) {
  const m = await d1Binding()!
    .prepare('SELECT * FROM "HotelMerchant" WHERE "hotelId"=?')
    .bind(hotelId)
    .first<Merchant>();
  if (!m)
    throw new HttpError(503, "This hotel has not configured secure checkout");
  return m;
}
async function guest(hotelId: string, secret: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret))
    throw new HttpError(401, "Saved hotel request unavailable");
  const s = await d1Binding()!
    .prepare(
      'SELECT * FROM "HotelStayRequest" WHERE "hotelId"=? AND "secretHash"=? ORDER BY "createdAt" DESC LIMIT 1',
    )
    .bind(hotelId, hash(secret))
    .first<Stay>();
  if (!s) throw new HttpError(404, "Hotel request unavailable");
  return s;
}
function credentials(m: Merchant) {
  return unseal<{ keySecret: string; webhookSecret: string }>(
    m.credentials,
    credentialContext(m),
  );
}
function auth(m: Merchant) {
  return {
    Authorization:
      "Basic " +
      Buffer.from(m.keyId + ":" + credentials(m).keySecret).toString("base64"),
    "Content-Type": "application/json",
  };
}
export async function configureHotelMerchant(
  userId: string,
  sessionToken: string,
  hotelId: string,
  input: unknown,
) {
  requireHotelBooking();
  const v = z
      .object({
        keyId: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]{6,100}$/),
        keySecret: z.string().min(12).max(250),
        webhookSecret: z.string().min(16).max(250),
        authorized: z.literal(true),
      })
      .strict()
      .parse(input),
    unit = await hotelUnit(userId),
    { role } = await ownedHotel(unit, userId, hotelId);
  if (role !== "OWNER")
    throw new HttpError(403, "Only the hotel owner can configure its merchant");
  const mode = v.keyId.startsWith("rzp_test_") ? "test" : "live";
  if (mode === "live") {
    if (process.env.HOTEL_LIVE_PAYMENTS_APPROVED !== "true")
      throw new HttpError(
        403,
        "Live hotel payments require separate platform approval",
      );
    unit.guard(
      'SELECT COUNT(*)=1 FROM "User" WHERE id=? AND "emailVerified"=1 AND "twoFactorEnabled"=1',
      userId,
    );
    const session = await unit.db
      .prepare(
        'SELECT COUNT(*) AS n FROM "Session" WHERE token=? AND "userId"=? AND julianday("expiresAt")>julianday(\'now\') AND julianday("mfaVerifiedAt")>julianday(\'now\',\'-30 minutes\')',
      )
      .bind(sessionToken, userId)
      .first<{ n: number }>();
    if (!session?.n)
      throw new HttpError(
        403,
        "Verify your authenticator again before connecting live money",
      );
    unit.guard(
      'SELECT COUNT(*)=1 FROM "Session" WHERE token=? AND "userId"=? AND julianday("expiresAt")>julianday(\'now\') AND julianday("mfaVerifiedAt")>julianday(\'now\',\'-30 minutes\')',
      sessionToken,
      userId,
    );
  }
  const old = await unit.db
    .prepare('SELECT * FROM "HotelMerchant" WHERE "hotelId"=?')
    .bind(hotelId)
    .first<Merchant>();
  const attempts = await unit.db
    .prepare(
      'SELECT COUNT(*) AS n FROM "HotelPaymentAttempt" WHERE "hotelId"=? AND (status<>\'FAILED_NO_ORDER\' OR "orderId" IS NOT NULL)',
    )
    .bind(hotelId)
    .first<{ n: number }>();
  if (attempts?.n)
    throw new HttpError(
      409,
      "Merchant rotation requires an operator-reviewed key-history/reconciliation migration after any checkout attempt",
    );
  unit.guard(
    'SELECT COUNT(*)=0 FROM "HotelPaymentAttempt" WHERE "hotelId"=? AND (status<>\'FAILED_NO_ORDER\' OR "orderId" IS NOT NULL)',
    hotelId,
  );
  const m = {
    id: old?.id || randomUUID(),
    hotelId,
    keyId: v.keyId,
    mode,
    revision: (old?.revision || 0) + 1,
  };
  unit.guard(
    'SELECT COUNT(*)=? FROM "HotelMerchant" WHERE "hotelId"=?',
    old ? 1 : 0,
    hotelId,
  );
  if (old)
    unit.guard(
      'SELECT revision=? FROM "HotelMerchant" WHERE id=?',
      old.revision,
      old.id,
    );
  unit.writes.push({
    sql: 'INSERT INTO "HotelMerchant" (id,"hotelId","keyId",credentials,mode,revision,"createdAt") VALUES (?,?,?,?,?,?,?) ON CONFLICT("hotelId") DO UPDATE SET "keyId"=excluded."keyId",credentials=excluded.credentials,mode=excluded.mode,revision=excluded.revision',
    values: [
      m.id,
      hotelId,
      m.keyId,
      seal(
        { keySecret: v.keySecret, webhookSecret: v.webhookSecret },
        credentialContext(m),
      ),
      mode,
      m.revision,
      new Date().toISOString(),
    ],
  });
  hotelAudit(unit, hotelId, userId, "MERCHANT_CONFIGURED", m.revision, {
    mode,
    keySuffix: v.keyId.slice(-4),
  });
  await unit.commit();
  return {
    message:
      "Hotel merchant saved securely. Configure its webhook before accepting checkout.",
    mode,
  };
}
export async function hotelMerchantOverview(hotelId: string) {
  const m = await d1Binding()!
    .prepare('SELECT id,mode,"keyId" FROM "HotelMerchant" WHERE "hotelId"=?')
    .bind(hotelId)
    .first<{ id: string; mode: string; keyId: string }>();
  return m
    ? {
        mode: m.mode,
        keySuffix: m.keyId.slice(-4),
        webhookPath: "/api/payments/hotels/" + m.id,
      }
    : null;
}
export async function createHotelOrder(
  hotelId: string,
  secret: string,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  requireHotelBooking();
  z.object({ confirmed: z.literal(true) })
    .strict()
    .parse(input);
  const s = await guest(hotelId, secret),
    m = await merchant(hotelId);
  if (s.status !== "HELD" || s.holdUntil <= new Date().toISOString())
    throw new HttpError(
      409,
      "Room hold expired or is no longer eligible for checkout",
    );
  if (m.mode === "live" && process.env.HOTEL_LIVE_PAYMENTS_APPROVED !== "true")
    throw new HttpError(403, "Live hotel payments are not approved");
  const headers = auth(m),
    unit = new D1Unit(d1Binding()!);
  const old = await unit.db
    .prepare(
      'SELECT * FROM "HotelPaymentAttempt" WHERE "stayId"=? AND "hotelId"=?',
    )
    .bind(s.id, hotelId)
    .first<Attempt>();
  if (old) {
    if (old.status === "PENDING" && old.orderId)
      return {
        orderId: old.orderId,
        amount: old.amount,
        currency: "INR",
        keyId: m.keyId,
        mode: m.mode,
      };
    if (old.status !== "FAILED_NO_ORDER" || old.orderId)
      throw new HttpError(
        409,
        "Checkout requires hotel reconciliation; no second order will be created automatically",
      );
  }
  const id = old?.id || randomUUID(),
    receipt = old?.receipt || "hs_" + s.id.replace(/-/g, "");
  if (old)
    unit.guard(
      'SELECT COUNT(*)=1 FROM "HotelPaymentAttempt" WHERE id=? AND status=\'FAILED_NO_ORDER\' AND "orderId" IS NULL',
      old.id,
    );
  else
    unit.guard(
      'SELECT COUNT(*)=0 FROM "HotelPaymentAttempt" WHERE "stayId"=?',
      s.id,
    );
  unit.guard(
    'SELECT revision=? FROM "HotelStayRequest" WHERE id=? AND "hotelId"=? AND status=\'HELD\' AND "holdUntil">?',
    s.revision,
    s.id,
    hotelId,
    new Date().toISOString(),
  );
  unit.guard(
    "SELECT COUNT(*)=1 FROM \"Hotel\" WHERE id=? AND status='APPROVED'",
    hotelId,
  );
  unit.guard(
    'SELECT revision=? FROM "HotelMerchant" WHERE id=? AND "hotelId"=?',
    m.revision,
    m.id,
    hotelId,
  );
  if (old)
    unit.writes.push({
      sql: 'UPDATE "HotelPaymentAttempt" SET status=\'CREATING\',"merchantId"=?,"merchantRevision"=? WHERE id=?',
      values: [m.id, m.revision, old.id],
    });
  else
    unit.writes.push({
      sql: 'INSERT INTO "HotelPaymentAttempt" (id,"hotelId","stayId","merchantId","merchantRevision",receipt,amount,status,"createdAt") VALUES (?,?,?,?,?,?,?,\'CREATING\',?)',
      values: [
        id,
        hotelId,
        s.id,
        m.id,
        m.revision,
        receipt,
        s.total,
        new Date().toISOString(),
      ],
    });
  await unit.commit();
  try {
    const result = z
      .object({
        id: z.string().regex(/^order_[A-Za-z0-9]+$/),
        amount: z.number().int(),
        currency: z.literal("INR"),
      })
      .parse(
        await providerJson(
          "https://api.razorpay.com/v1/orders",
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              amount: s.total,
              currency: "INR",
              receipt,
              notes: { hotel_id: hotelId, stay_id: s.id },
            }),
          },
          transport,
        ),
      );
    if (result.amount !== s.total) throw Error("Unexpected order amount");
    const next = new D1Unit(d1Binding()!);
    next.guard(
      "SELECT COUNT(*)=1 FROM \"HotelPaymentAttempt\" WHERE id=? AND status='CREATING'",
      id,
    );
    next.writes.push(
      {
        sql: 'UPDATE "HotelPaymentAttempt" SET "orderId"=?,status=\'PENDING\' WHERE id=?',
        values: [result.id, id],
      },
      {
        sql: 'UPDATE "HotelStayRequest" SET "paymentStatus"=\'PENDING\',revision=revision+1 WHERE id=? AND "hotelId"=?',
        values: [s.id, hotelId],
      },
    );
    await next.commit();
    return {
      orderId: result.id,
      amount: s.total,
      currency: "INR",
      keyId: m.keyId,
      mode: m.mode,
    };
  } catch (e) {
    const definite =
      e instanceof ProviderError &&
      ["NEEDS_REAUTH", "PERMISSION", "INVALID_REQUEST", "RATE_LIMIT"].includes(
        e.code,
      );
    await d1Binding()!
      .prepare(
        "UPDATE \"HotelPaymentAttempt\" SET status=? WHERE id=? AND status='CREATING'",
      )
      .bind(definite ? "FAILED_NO_ORDER" : "RECONCILIATION_REQUIRED", id)
      .run();
    throw new HttpError(
      502,
      definite
        ? "Checkout was rejected. Ask the hotel to review its merchant setup."
        : "Order creation could not be confirmed. The hotel must reconcile it; do not retry with a new order.",
    );
  }
}
async function verifiedCapture(
  m: Merchant,
  orderId: string,
  paymentId: string,
  transport: typeof fetch,
) {
  const attempt = await d1Binding()!
    .prepare(
      'SELECT * FROM "HotelPaymentAttempt" WHERE "orderId"=? AND "hotelId"=? AND "merchantId"=?',
    )
    .bind(orderId, m.hotelId, m.id)
    .first<Attempt>();
  if (!attempt)
    throw new HttpError(404, "Payment order not found for this hotel");
  const p = z
    .object({
      id: z.string(),
      order_id: z.string(),
      amount: z.number().int(),
      currency: z.string(),
      status: z.string(),
    })
    .parse(
      await providerJson(
        "https://api.razorpay.com/v1/payments/" + encodeURIComponent(paymentId),
        { headers: auth(m) },
        transport,
      ),
    );
  if (
    p.id !== paymentId ||
    p.order_id !== orderId ||
    p.amount !== attempt.amount ||
    p.currency !== "INR" ||
    p.status !== "captured"
  )
    throw new HttpError(409, "Captured payment could not be verified");
  return attempt;
}
async function recordCapture(
  m: Merchant,
  a: Attempt,
  paymentId: string,
  event?: { id: string; hash: string; type: string },
) {
  const unit = new D1Unit(d1Binding()!),
    s = await unit.db
      .prepare('SELECT * FROM "HotelStayRequest" WHERE id=? AND "hotelId"=?')
      .bind(a.stayId, m.hotelId)
      .first<Stay>();
  if (!s) throw new HttpError(404, "Hotel reservation unavailable");
  if (a.paymentId && a.paymentId !== paymentId)
    throw new HttpError(409, "Order already has a different captured payment");
  if (event) {
    const prior = await unit.db
      .prepare(
        'SELECT "bodyHash" FROM "HotelPaymentEvent" WHERE "merchantId"=? AND "eventId"=?',
      )
      .bind(m.id, event.id)
      .first<{ bodyHash: string }>();
    if (prior) {
      if (prior.bodyHash !== event.hash)
        throw new HttpError(409, "Webhook event body changed");
      return;
    }
    unit.guard(
      'SELECT COUNT(*)=0 FROM "HotelPaymentEvent" WHERE "merchantId"=? AND "eventId"=?',
      m.id,
      event.id,
    );
    unit.writes.push({
      sql: 'INSERT INTO "HotelPaymentEvent" ("merchantId","eventId","bodyHash","eventType","createdAt") VALUES (?,?,?,?,?)',
      values: [
        m.id,
        event.id,
        event.hash,
        event.type,
        new Date().toISOString(),
      ],
    });
  }
  if (a.status !== "CAPTURED") {
    unit.guard(
      'SELECT COUNT(*)=1 FROM "HotelPaymentAttempt" WHERE id=? AND "merchantId"=? AND status<>\'CAPTURED\'',
      a.id,
      m.id,
    );
    unit.guard(
      'SELECT revision=? FROM "HotelStayRequest" WHERE id=? AND "hotelId"=?',
      s.revision,
      s.id,
      m.hotelId,
    );
    const hotel = await unit.db
      .prepare('SELECT status FROM "Hotel" WHERE id=?')
      .bind(m.hotelId)
      .first<{ status: string }>();
    if (hotel)
      unit.guard(
        'SELECT status=? FROM "Hotel" WHERE id=?',
        hotel.status,
        m.hotelId,
      );
    const active =
      s.status === "HELD" &&
      s.holdUntil > new Date().toISOString() &&
      hotel?.status === "APPROVED";
    if (active)
      unit.guard(
        "SELECT COUNT(*)=1 FROM \"HotelStayRequest\" WHERE id=? AND status='HELD' AND \"holdUntil\">strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        s.id,
      );
    unit.guard(
      'SELECT revision=? FROM "HotelMerchant" WHERE id=? AND "hotelId"=?',
      a.merchantRevision,
      m.id,
      m.hotelId,
    );
    const confirm =
      active &&
      m.mode === "live" &&
      process.env.HOTEL_LIVE_PAYMENTS_APPROVED === "true";
    const sandbox = active && m.mode === "test";
    unit.writes.push({
      sql: 'UPDATE "HotelPaymentAttempt" SET status=\'CAPTURED\',"lastFailure"=\'\',"paymentId"=?,"verifiedAt"=? WHERE id=?',
      values: [paymentId, new Date().toISOString(), a.id],
    });
    unit.writes.push({
      sql: 'UPDATE "HotelStayRequest" SET status=?,"paymentStatus"=?,revision=revision+1 WHERE id=? AND "hotelId"=?',
      values: [
        confirm ? "CONFIRMED" : sandbox ? "SANDBOX_COMPLETED" : s.status,
        confirm ? "VERIFIED" : sandbox ? "SANDBOX_VERIFIED" : "REFUND_REVIEW",
        s.id,
        m.hotelId,
      ],
    });
    hotelAudit(
      unit,
      m.hotelId,
      "razorpay",
      confirm
        ? "BOOKING_CONFIRMED"
        : sandbox
          ? "SANDBOX_COMPLETED"
          : "CAPTURE_REQUIRES_REVIEW",
      s.revision + 1,
      { stayId: s.id, paymentId, amount: a.amount, mode: m.mode },
    );
  }
  await unit.commit();
}
export async function verifyHotelCheckout(
  hotelId: string,
  secret: string,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  requireHotelBooking();
  const v = z
      .object({
        orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
        paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
        signature: z.string().length(64),
      })
      .strict()
      .parse(input),
    s = await guest(hotelId, secret),
    m = await merchant(hotelId);
  if (
    !signatureValid(
      createHmac("sha256", credentials(m).keySecret)
        .update(v.orderId + "|" + v.paymentId)
        .digest("hex"),
      v.signature,
    )
  )
    throw new HttpError(400, "Invalid checkout signature");
  const a = await verifiedCapture(m, v.orderId, v.paymentId, transport);
  if (a.stayId !== s.id)
    throw new HttpError(403, "Payment does not belong to this guest request");
  await recordCapture(m, a, v.paymentId);
  return hotelStayStatus(hotelId, secret);
}
export async function hotelPaymentWebhook(
  merchantId: string,
  raw: Uint8Array,
  signature: string | null,
  eventId: string | null,
  transport: typeof fetch = fetch,
) {
  requireHotelBooking();
  const m = await d1Binding()!
    .prepare('SELECT * FROM "HotelMerchant" WHERE id=?')
    .bind(merchantId)
    .first<Merchant>();
  if (!m) throw new HttpError(404, "Hotel merchant unavailable");
  if (
    !signature ||
    !signatureValid(
      createHmac("sha256", credentials(m).webhookSecret)
        .update(raw)
        .digest("hex"),
      signature,
    )
  )
    throw new HttpError(400, "Invalid webhook signature");
  if (!eventId || !/^[-A-Za-z0-9_]{1,120}$/.test(eventId))
    throw new HttpError(400, "Missing webhook event ID");
  const rawBody = JSON.parse(new TextDecoder().decode(raw));
  const event = z.object({ event: z.string() }).parse(rawBody).event;
  if (!["payment.captured", "payment.failed"].includes(event))
    return { received: true, processed: false };
  const body = z
    .object({
      event: z.string(),
      payload: z.object({
        payment: z.object({
          entity: z.object({
            id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
            order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
          }),
        }),
      }),
    })
    .parse(rawBody);
  if (event === "payment.failed") {
    const unit = new D1Unit(d1Binding()!);
    const prior = await unit.db
      .prepare(
        'SELECT "bodyHash" FROM "HotelPaymentEvent" WHERE "merchantId"=? AND "eventId"=?',
      )
      .bind(m.id, eventId)
      .first<{ bodyHash: string }>();
    const bodyHash = hash(new TextDecoder().decode(raw));
    if (prior) {
      if (prior.bodyHash !== bodyHash)
        throw new HttpError(409, "Webhook event body changed");
      return { received: true, processed: true };
    }
    const order = await unit.db
      .prepare(
        'SELECT id FROM "HotelPaymentAttempt" WHERE "hotelId"=? AND "merchantId"=? AND "orderId"=?',
      )
      .bind(m.hotelId, m.id, body.payload.payment.entity.order_id)
      .first<{ id: string }>();
    if (!order) return { received: true, processed: false };
    unit.guard(
      'SELECT COUNT(*)=0 FROM "HotelPaymentEvent" WHERE "merchantId"=? AND "eventId"=?',
      m.id,
      eventId,
    );
    unit.writes.push(
      {
        sql: 'INSERT INTO "HotelPaymentEvent" ("merchantId","eventId","bodyHash","eventType","createdAt") VALUES (?,?,?,?,?)',
        values: [m.id, eventId, bodyHash, event, new Date().toISOString()],
      },
      {
        sql: 'UPDATE "HotelPaymentAttempt" SET "lastFailure"=\'payment.failed\' WHERE id=? AND "hotelId"=? AND status<>\'CAPTURED\'',
        values: [order.id, m.hotelId],
      },
    );
    await unit.commit();
    return { received: true, processed: true };
  }
  const a = await verifiedCapture(
    m,
    body.payload.payment.entity.order_id,
    body.payload.payment.entity.id,
    transport,
  );
  await recordCapture(m, a, body.payload.payment.entity.id, {
    id: eventId,
    hash: hash(new TextDecoder().decode(raw)),
    type: body.event,
  });
  return { received: true, processed: true };
}
export async function reconcileHotelOrder(
  userId: string,
  hotelId: string,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  requireHotelBooking();
  const v = z
      .object({
        stayId: z.uuid(),
        orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(input),
    unit = await hotelUnit(userId),
    { role } = await ownedHotel(unit, userId, hotelId);
  if (role !== "OWNER")
    throw new HttpError(403, "Hotel owner reconciliation required");
  const a = await unit.db
    .prepare(
      'SELECT * FROM "HotelPaymentAttempt" WHERE "stayId"=? AND "hotelId"=?',
    )
    .bind(v.stayId, hotelId)
    .first<Attempt>();
  if (
    !a ||
    !["CREATING", "RECONCILIATION_REQUIRED", "FAILED_NO_ORDER"].includes(
      a.status,
    )
  )
    throw new HttpError(409, "No uncertain order requires reconciliation");
  const m = await merchant(hotelId),
    order = z
      .object({
        id: z.string(),
        amount: z.number().int(),
        currency: z.string(),
        receipt: z.string(),
      })
      .parse(
        await providerJson(
          "https://api.razorpay.com/v1/orders/" + encodeURIComponent(v.orderId),
          { headers: auth(m) },
          transport,
        ),
      );
  if (
    order.id !== v.orderId ||
    order.amount !== a.amount ||
    order.currency !== "INR" ||
    order.receipt !== a.receipt
  )
    throw new HttpError(409, "Order does not match this hotel request");
  unit.guard(
    'SELECT status=? FROM "HotelPaymentAttempt" WHERE id=? AND "hotelId"=?',
    a.status,
    a.id,
    hotelId,
  );
  unit.writes.push(
    {
      sql: 'UPDATE "HotelPaymentAttempt" SET "orderId"=?,status=\'PENDING\' WHERE id=?',
      values: [v.orderId, a.id],
    },
    {
      sql: 'UPDATE "HotelStayRequest" SET "paymentStatus"=\'PENDING\',revision=revision+1 WHERE id=? AND "hotelId"=?',
      values: [a.stayId, hotelId],
    },
  );
  hotelAudit(unit, hotelId, userId, "PAYMENT_ORDER_RECONCILED", 0, {
    stayId: a.stayId,
    orderId: v.orderId,
  });
  await unit.commit();
  return {
    message: "Existing Razorpay order matched. No new order was created.",
  };
}
