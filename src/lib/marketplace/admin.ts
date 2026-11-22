import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOperator } from "../operator-access";
import { HttpError } from "../http";
import {
  Unit,
  businessLink,
  identity,
  id,
  kind,
  paise,
  now,
  update,
  commission,
  ledger,
  digest,
} from "./core";
import type { Plan, Business, Booking, Agreement, Snapshot } from "./types";
// Remains enforced even when the new UI is disabled after rollout. Older
// databases without the additive guest table retain their existing behavior.
async function guardGuestDeparture(u: Unit, stayId: string) {
  const installed = await u.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='HotelGuestStay'",
    )
    .first();
  if (!installed) return;
  const open = await u.db
    .prepare(
      'SELECT "stayId" FROM "HotelGuestStay" WHERE "stayId"=? AND "checkedOutAt" IS NULL',
    )
    .bind(stayId)
    .first();
  if (open)
    throw new HttpError(
      409,
      "Record guest check-out before cancelling or fully refunding this reservation",
    );
  u.guard(
    'SELECT COUNT(*)=0 FROM "HotelGuestStay" WHERE "stayId"=? AND "checkedOutAt" IS NULL',
    stayId,
  );
}
export async function adminUnit(userId: string, token: string) {
  await requireOperator(userId, token);
  const u = new Unit();
  await identity(u, userId, true);
  u.guard(
    'SELECT COUNT(*)=1 FROM "Session" WHERE token=? AND "userId"=? AND julianday("expiresAt")>julianday(\'now\') AND julianday("mfaVerifiedAt")>julianday(\'now\',\'-4 hours\')',
    token,
    userId,
  );
  return u;
}
const reference = z.string().trim().min(8).max(300);
const config = z
  .object({
    monthlyPaise: paise,
    requestLimit: z.number().int().min(1).max(100000),
    resourceLimit: z.number().int().min(1).max(1000),
    commissionBps: z.number().int().min(0).max(10000),
    platformBps: z.number().int().min(0).max(10000),
    agencyBps: z.number().int().min(0).max(10000),
    supplierBps: z.number().int().min(0).max(10000),
    basis: z.enum(["NET_TOTAL", "NET_AFTER_DISCOUNT"]),
  })
  .strict()
  .refine(
    (v) => v.platformBps + v.agencyBps + v.supplierBps === 10000,
    "Shares must total 10000 basis points",
  );
export async function adminCommand(
  userId: string,
  token: string,
  input: unknown,
) {
  const v = z
    .discriminatedUnion("action", [
      z
        .object({
          action: z.literal("plan"),
          kind,
          revision: z.number().int().min(0),
          config,
        })
        .strict(),
      z
        .object({
          action: z.literal("review"),
          businessId: id,
          revision: z.number().int().min(0),
          decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
          reason: reference,
          businessVerified: z.boolean(),
        })
        .strict(),
      z
        .object({
          action: z.literal("agreement"),
          businessId: id,
          revision: z.number().int().min(0),
          terms: z.string().trim().min(40).max(4000),
          config,
        })
        .strict(),
      z
        .object({
          action: z.literal("subscription"),
          businessId: id,
          revision: z.number().int().min(0),
          status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]),
          days: z.number().int().min(1).max(366),
          reference,
        })
        .strict(),
      z
        .object({
          action: z.literal("referral"),
          businessId: id,
          agencyId: id,
          status: z.enum(["ACTIVE", "REVOKED"]),
          reference,
        })
        .strict(),
      z
        .object({
          action: z.literal("paymentRecord"),
          bookingId: id,
          revision: z.number().int().min(0),
          eventKey: z.uuid(),
          amount: z.number().int().min(1).max(10000000000),
          reference,
        })
        .strict(),
      z
        .object({
          action: z.literal("refundRecord"),
          bookingId: id,
          revision: z.number().int().min(0),
          eventKey: z.uuid(),
          refundedNet: z.number().int().min(0).max(10000000000),
          refundedTax: z.number().int().min(0).max(10000000000),
          reference,
        })
        .strict(),
      z
        .object({
          action: z.literal("cancel"),
          bookingId: id,
          revision: z.number().int().min(0),
          eventKey: z.uuid(),
          reference,
          refundReviewed: z.literal(true),
        })
        .strict(),
      z
        .object({
          action: z.literal("settlement"),
          bookingId: id,
          revision: z.number().int().min(0),
          eventKey: z.uuid(),
          party: z.enum(["PLATFORM", "AGENCY"]),
          direction: z.enum(["COLLECTED", "RETURNED"]),
          amount: z.number().int().min(1).max(10000000000),
          reference,
        })
        .strict(),
    ])
    .parse(input);
  const u = await adminUnit(userId, token);
  let businessId: string | null = null;
  if (v.action === "plan") {
    const p = await u.row<Plan>("MPPlan", v.kind);
    if (p.revision !== v.revision)
      throw new HttpError(409, "Plan changed; refresh");
    update(u, "MPPlan", p.id, v.config);
  } else if (
    v.action === "review" ||
    v.action === "agreement" ||
    v.action === "subscription"
  ) {
    const b = await u.row<Business>("MPBusiness", v.businessId);
    businessId = b.id;
    if (b.ownerId === userId && v.action === "review")
      throw new HttpError(403, "Independent operator review required");
    if (v.action === "review") {
      if (
        b.revision !== v.revision ||
        !(v.decision === "SUSPENDED"
          ? b.status === "APPROVED"
          : b.status === "PENDING")
      )
        throw new HttpError(
          409,
          "Review not allowed for current revision/state",
        );
      if (v.decision === "APPROVED") {
        if (!v.businessVerified)
          throw new HttpError(400, "Business evidence must be verified");
        await identity(u, b.ownerId, true);
        await businessLink(u, b);
        if (b.hotelId)
          u.guard(
            "SELECT COUNT(*)=1 FROM \"Hotel\" WHERE id=? AND status='APPROVED'",
            b.hotelId,
          );
      }
      update(u, "MPBusiness", b.id, {
        status: v.decision,
        reviewReason: v.reason,
      });
    } else if (v.action === "agreement") {
      const a = await u.row<Agreement>("MPAgreement", b.id);
      if (a.revision !== v.revision)
        throw new HttpError(409, "Agreement changed");
      const { commissionBps, platformBps, agencyBps, supplierBps, basis } =
        v.config;
      update(u, "MPAgreement", b.id, {
        version: a.version + 1,
        terms: v.terms,
        commissionBps,
        platformBps,
        agencyBps,
        supplierBps,
        basis,
        acceptedAt: null,
        acceptedBy: null,
      });
    } else {
      const s = await u.row<{ revision: number }>("MPSubscription", b.id),
        p = await u.row<Plan>("MPPlan", b.kind);
      if (s.revision !== v.revision)
        throw new HttpError(409, "Subscription changed");
      const expiresAt = new Date(Date.now() + v.days * 86400000).toISOString();
      if (b.kind === "AGENCY" && b.agencyId) {
        await u.read("Agency", '"id"=?', [b.agencyId]);
        u.writes.push({
          sql: 'UPDATE "Agency" SET subscription=?,"subscriptionExpiresAt"=? WHERE id=?',
          values: [
            v.status === "ACTIVE"
              ? "Active"
              : v.status === "PAUSED"
                ? "Paused"
                : "Cancelled",
            v.status === "ACTIVE" ? expiresAt : null,
            b.agencyId,
          ],
        });
      }
      update(u, "MPSubscription", b.id, {
        status: v.status,
        monthlyPaise: p.monthlyPaise,
        expiresAt,
        reference: v.reference,
      });
    }
  } else if (v.action === "referral") {
    const business = await u.row<Business>("MPBusiness", v.businessId);
    businessId = business.id;
    await u.read("Agency", '"id"=?', [v.agencyId]);
    u.guard(
      'SELECT COUNT(*)=1 FROM "Agency" WHERE id=? AND demo=0',
      v.agencyId,
    );
    u.writes.push({
      sql: "INSERT INTO MPReferral(id,businessId,agencyId,status,reference,verifiedBy,createdAt) VALUES(?,?,?,?,?,?,?) ON CONFLICT(businessId,agencyId) DO UPDATE SET status=excluded.status,reference=excluded.reference,verifiedBy=excluded.verifiedBy,revision=MPReferral.revision+1",
      values: [
        randomUUID(),
        business.id,
        v.agencyId,
        v.status,
        v.reference,
        userId,
        now(),
      ],
    });
  } else {
    const b = await u.row<Booking>("MPBooking", v.bookingId);
    businessId = b.businessId;
    const payloadHash = digest(v);
    if (v.action === "settlement") {
      const prior = await u.db
        .prepare("SELECT * FROM MPSettlement WHERE eventKey=?")
        .bind(v.eventKey)
        .first<{
          bookingId: string;
          party: string;
          direction: string;
          amount: number;
          reference: string;
        }>();
      if (prior) {
        if (
          prior.bookingId !== b.id ||
          prior.party !== v.party ||
          prior.direction !== v.direction ||
          prior.amount !== v.amount ||
          prior.reference !== v.reference
        )
          throw new HttpError(409, "Settlement key payload differs");
        return {
          message: "Existing settlement record; no payment executed",
          replayed: true,
        };
      }
    } else {
      const prior = await u.db
        .prepare("SELECT payloadHash FROM MPAdjustment WHERE eventKey=?")
        .bind(v.eventKey)
        .first<{ payloadHash: string }>();
      if (prior) {
        if (prior.payloadHash !== payloadHash)
          throw new HttpError(409, "Adjustment key payload differs");
        return {
          message: "Existing adjustment record; no payment executed",
          replayed: true,
        };
      }
    }
    if (b.revision !== v.revision)
      throw new HttpError(409, "Booking changed; refresh");
    const snapshot = JSON.parse(b.snapshot) as Snapshot;
    if (v.action === "settlement") {
      const column = v.party === "PLATFORM" ? "platform" : "agency";
      const amounts = await u.db
        .prepare(
          `SELECT COALESCE((SELECT SUM(${column}) FROM MPCommission WHERE bookingId=?),0) earned,COALESCE((SELECT SUM(CASE direction WHEN 'COLLECTED' THEN amount ELSE -amount END) FROM MPSettlement WHERE bookingId=? AND party=?),0) settled`,
        )
        .bind(b.id, b.id, v.party)
        .first<{ earned: number; settled: number }>();
      const due = (amounts?.earned || 0) - (amounts?.settled || 0);
      if (
        (v.direction === "COLLECTED" && v.amount > due) ||
        (v.direction === "RETURNED" && v.amount > -due)
      )
        throw new HttpError(
          409,
          "Settlement exceeds the outstanding signed balance",
        );
      u.writes.push({
        sql: "INSERT INTO MPSettlement VALUES(?,?,?,?,?,?,?,?,?)",
        values: [
          randomUUID(),
          b.id,
          v.eventKey,
          v.party,
          v.direction,
          v.amount,
          v.reference,
          userId,
          now(),
        ],
      });
      update(u, "MPBooking", b.id, {});
    } else {
      if (v.action === "paymentRecord") {
        if (
          snapshot.kind === "HOTEL" ||
          !["CONFIRMED", "COMPLETED"].includes(b.status) ||
          b.paymentStatus !== "UNPAID" ||
          v.amount !== b.total
        )
          throw new HttpError(
            409,
            "Verify a full externally received charter payment against its original confirmed total",
          );
        update(u, "MPBooking", b.id, { paymentStatus: "EXTERNALLY_VERIFIED" });
      } else if (v.action === "refundRecord") {
        if (
          !["PROVIDER_VERIFIED", "EXTERNALLY_VERIFIED"].includes(
            b.paymentStatus,
          ) ||
          !["CONFIRMED", "COMPLETED", "CANCELLED"].includes(b.status) ||
          v.refundedNet < b.refundedNet ||
          v.refundedTax < b.refundedTax ||
          v.refundedNet > b.subtotal - b.discount ||
          v.refundedTax > b.tax ||
          (v.refundedNet === b.refundedNet && v.refundedTax === b.refundedTax)
        )
          throw new HttpError(
            409,
            "Refund must increase documented cumulative refunded amounts within the verified payment",
          );
        const after = {
          ...b,
          refundedNet: v.refundedNet,
          refundedTax: v.refundedTax,
        };
        const full =
          v.refundedNet === b.subtotal - b.discount && v.refundedTax === b.tax;
        const earnings = await u.db
          .prepare(
            "SELECT COUNT(*) n FROM MPCommission WHERE bookingId=? AND kind='EARNED'",
          )
          .bind(b.id)
          .first<{ n: number }>();
        if (earnings?.n) {
          const before = commission(b, snapshot),
            next = commission(after, snapshot);
          ledger(u, b, "refund:" + v.eventKey, "REFUND_ADJUSTMENT", {
            eligibleNet: next.eligibleNet - before.eligibleNet,
            commission: next.commission - before.commission,
            platform: next.platform - before.platform,
            agency: next.agency - before.agency,
            supplier: next.supplier - before.supplier,
          });
        }
        update(u, "MPBooking", b.id, {
          refundedNet: v.refundedNet,
          refundedTax: v.refundedTax,
          ...(full ? { status: "REFUNDED", paymentStatus: "REFUNDED" } : {}),
        });
        if (full && b.hotelStayId) await guardGuestDeparture(u, b.hotelStayId);
        if (full && b.hotelStayId)
          u.writes.push({
            sql: "UPDATE \"HotelStayRequest\" SET status='CANCELLED',\"paymentStatus\"='REFUND_REVIEW',revision=revision+1 WHERE id=?",
            values: [b.hotelStayId],
          });
      } else {
        if (!["REQUESTED", "HELD", "CONFIRMED", "EXPIRED"].includes(b.status))
          throw new HttpError(409, "Only an open booking can be cancelled");
        update(u, "MPBooking", b.id, { status: "CANCELLED" });
        if (b.hotelStayId) {
          await guardGuestDeparture(u, b.hotelStayId);
          u.guard(
            "SELECT COUNT(*)=0 FROM \"HotelPaymentAttempt\" WHERE \"stayId\"=? AND status IN('CREATING','PENDING','RECONCILIATION_REQUIRED')",
            b.hotelStayId,
          );
          u.writes.push({
            sql: "UPDATE \"HotelStayRequest\" SET status='CANCELLED',revision=revision+1 WHERE id=?",
            values: [b.hotelStayId],
          });
        }
      }
      u.writes.push({
        sql: "INSERT INTO MPAdjustment VALUES(?,?,?,?,?,?,?,?)",
        values: [
          randomUUID(),
          b.id,
          v.eventKey,
          payloadHash,
          v.action === "paymentRecord"
            ? "EXTERNAL_PAYMENT"
            : v.action === "refundRecord"
              ? "REFUND_RECORD"
              : "CANCELLATION",
          v.reference,
          userId,
          now(),
        ],
      });
    }
  }
  u.audit(userId, businessId, "ADMIN_" + v.action.toUpperCase(), v);
  await u.commit();
  return {
    message: "Recorded. No payment, transfer, split or refund was executed.",
  };
}
export async function adminDashboard(userId: string, token: string) {
  const u = await adminUnit(userId, token);
  const rows = await u.db.batch<Record<string, unknown>>([
    u.db.prepare("SELECT * FROM MPPlan ORDER BY id"),
    u.db.prepare(
      "SELECT b.*,s.status subscriptionStatus,s.monthlyPaise,s.expiresAt,s.revision subscriptionRevision,a.terms,a.commissionBps,a.platformBps,a.agencyBps,a.supplierBps,a.basis,a.acceptedAt,a.revision agreementRevision FROM MPBusiness b JOIN MPSubscription s ON s.id=b.id JOIN MPAgreement a ON a.id=b.id ORDER BY b.createdAt DESC LIMIT 200",
    ),
    u.db.prepare(
      "SELECT b.*,s.kind,s.name supplierName FROM MPBooking b JOIN MPBusiness s ON s.id=b.businessId ORDER BY b.createdAt DESC,b.id DESC LIMIT 200",
    ),
    u.db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM MPBusiness) businesses,(SELECT COUNT(*) FROM MPSubscription WHERE status='ACTIVE' AND expiresAt>?) activeSubscriptions,(SELECT COALESCE(SUM(monthlyPaise),0) FROM MPSubscription WHERE status='ACTIVE' AND expiresAt>?) mrr,(SELECT COUNT(*) FROM MPBooking WHERE status IN('EXPIRED','CANCELLED')) failedOrCancelled,(SELECT COUNT(*) FROM \"HotelPaymentAttempt\" WHERE status IN('FAILED_NO_ORDER','RECONCILIATION_REQUIRED'))+(SELECT COUNT(*) FROM \"HotelStayRequest\" WHERE \"paymentStatus\"='REFUND_REVIEW') hotelPaymentErrors,(SELECT COUNT(*) FROM \"Agency\" WHERE demo=0) legacyAgencies,(SELECT COUNT(*) FROM \"Hotel\") legacyHotels",
      )
      .bind(now(), now()),
    u.db.prepare(
      "SELECT COALESCE(SUM(commission),0) commission,COALESCE(SUM(platform),0) platform,COALESCE(SUM(agency),0) agency FROM MPCommission",
    ),
    u.db
      .prepare(
        "SELECT COALESCE(SUM(operations),0) operations,COALESCE(SUM(requests),0) requests FROM MPUsage WHERE day>=?",
      )
      .bind(now().slice(0, 7) + "-01"),
    u.db.prepare("SELECT * FROM MPAudit ORDER BY createdAt DESC LIMIT 100"),
    u.db.prepare(
      "SELECT id,COALESCE((SELECT SUM(platform) FROM MPCommission c WHERE c.bookingId=b.id),0)-COALESCE((SELECT SUM(CASE direction WHEN 'COLLECTED' THEN amount ELSE -amount END) FROM MPSettlement s WHERE s.bookingId=b.id AND party='PLATFORM'),0) platformDue,COALESCE((SELECT SUM(agency) FROM MPCommission c WHERE c.bookingId=b.id),0)-COALESCE((SELECT SUM(CASE direction WHEN 'COLLECTED' THEN amount ELSE -amount END) FROM MPSettlement s WHERE s.bookingId=b.id AND party='AGENCY'),0) agencyDue FROM MPBooking b WHERE EXISTS(SELECT 1 FROM MPCommission c WHERE c.bookingId=b.id) ORDER BY createdAt DESC LIMIT 500",
    ),
  ]);
  const aggregates = await u.db
    .prepare(
      `WITH earned AS (SELECT bookingId,SUM(platform) p,SUM(agency) a FROM MPCommission GROUP BY bookingId),settled AS (SELECT bookingId,SUM(CASE WHEN party='PLATFORM' THEN CASE direction WHEN 'COLLECTED' THEN amount ELSE -amount END ELSE 0 END) p,SUM(CASE WHEN party='AGENCY' THEN CASE direction WHEN 'COLLECTED' THEN amount ELSE -amount END ELSE 0 END) a FROM MPSettlement GROUP BY bookingId),due AS(SELECT earned.p-COALESCE(settled.p,0) p,earned.a-COALESCE(settled.a,0) a FROM earned LEFT JOIN settled USING(bookingId)) SELECT COALESCE(SUM(max(p,0)+max(a,0)),0) pendingSettlements,COALESCE(SUM(max(-p,0)+max(-a,0)),0) settlementCredits,(SELECT COUNT(*) FROM MPBooking r JOIN MPBusiness b ON b.id=r.businessId WHERE b.kind='HOTEL') hotelBookings,(SELECT COUNT(*) FROM MPBooking r JOIN MPBusiness b ON b.id=r.businessId WHERE b.kind='BUS') busBookings,(SELECT COUNT(*) FROM MPBooking r JOIN MPBusiness b ON b.id=r.businessId WHERE b.kind='CAR') carBookings FROM due`,
    )
    .first<Record<string, number>>();
  return {
    plans: rows[0].results,
    businesses: rows[1].results,
    bookings: rows[2].results,
    metrics: { ...rows[3].results[0], ...rows[4].results[0], ...aggregates },
    usage: {
      ...rows[5].results[0],
      scope:
        "Marketplace application operations only; not measured D1 rows read or Cloudflare billing. Legacy CRM and provider usage not included.",
      infrastructureCost:
        "Not available from application counters; inspect Cloudflare dashboard. Paid features remain disabled.",
    },
    audit: rows[6].results,
    balances: rows[7].results,
    scopeNote:
      "Latest 200 businesses/bookings, 100 audit events, 500 settlement balances. Metrics aggregate all registered marketplace rows; legacy counts are separate.",
  };
}
