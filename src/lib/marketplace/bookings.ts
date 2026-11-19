import { hotelCapability } from "./hotel-access";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../http";
import { requireSubscription } from "../subscriptions";
import type { Agency } from "@prisma/client";
import { hotelQuote, holdHotelRoom } from "../hotels/booking";
import {
  Unit,
  businessLink,
  identity,
  own,
  id,
  date,
  phone,
  dates,
  now,
  digest,
  limit,
  rounded,
  update,
  effective,
  commission,
  ledger,
} from "./core";
import type { Booking, Business, Vehicle, Agreement, Snapshot } from "./types";
const selection = z
  .object({
    businessId: id,
    vehicleId: id.optional(),
    roomId: id.optional(),
    start: date,
    end: date,
    route: z.string().trim().min(3).max(200),
    capacity: z.number().int().min(1).max(100),
    km: z.number().int().min(1).max(10000),
    rooms: z.number().int().min(1).max(10).default(1),
    adults: z.number().int().min(1).max(100).default(2),
    children: z.number().int().min(0).max(100).default(0),
    channel: z.enum(["MARKETPLACE", "AGENCY", "DIRECT"]).default("MARKETPLACE"),
  })
  .strict();
export type Selection = z.infer<typeof selection>;
async function quoteInUnit(u: Unit, userId: string, input: unknown) {
  const v = selection.parse(input);
  dates(v.start, v.end);
  const user = await identity(u, userId, true),
    b = await u.row<Business>("MPBusiness", v.businessId);
  if (b.status !== "APPROVED" || b.kind === "AGENCY")
    throw new HttpError(404, "Approved supplier not available");
  await businessLink(u, b);
  await limit(u, b);
  let agencyId: string | null = null;
  if (v.channel === "DIRECT" && b.ownerId !== userId)
    throw new HttpError(403, "Only this supplier can create direct bookings");
  if (v.channel === "AGENCY") {
    if (!user.agencyId) throw new HttpError(403, "Agency membership required");
    const agency = (
      await u.read<Agency>("Agency", '"id"=?', [user.agencyId])
    )[0];
    if (!agency || agency.demo) throw new HttpError(403, "Agency unavailable");
    requireSubscription(agency);
    const referral = await u.db
      .prepare(
        "SELECT id,revision FROM MPReferral WHERE businessId=? AND agencyId=? AND status='ACTIVE'",
      )
      .bind(b.id, agency.id)
      .first<{ id: string; revision: number }>();
    if (!referral)
      throw new HttpError(
        403,
        "A verified supplier–agency referral agreement is required for a commission-exempt referral; otherwise choose marketplace booking",
      );
    u.guard(
      "SELECT COUNT(*)=1 FROM MPReferral WHERE id=? AND revision=? AND status='ACTIVE'",
      referral.id,
      referral.revision,
    );
    agencyId = agency.id;
  }
  const agreement = await u.row<Agreement>("MPAgreement", b.id);
  if (v.channel !== "DIRECT" && !agreement.acceptedAt)
    throw new HttpError(
      409,
      "Supplier must accept the commercial agreement first",
    );
  const origin =
    v.channel === "AGENCY"
      ? "AGENCY_REFERRAL"
      : v.channel === "DIRECT"
        ? "DIRECT"
        : "MARKETPLACE";
  if (origin === "MARKETPLACE" && user.agencyId) agencyId = user.agencyId;
  let subtotal = 0,
    tax = 0,
    snapshot: Snapshot = {
      kind: b.kind,
      policies: "",
      paymentTerms: b.kind === "HOTEL" ? "HOTEL_PROVIDER" : "PAY_AT_SUPPLIER",
      agreement,
      eligible: origin === "MARKETPLACE" && !!agreement.acceptedAt,
      hasAgency: !!agencyId,
    };
  if (b.kind === "HOTEL") {
    if (!b.hotelId || !v.roomId || v.vehicleId)
      throw new HttpError(400, "Choose a hotel room category");
    const stay = {
      roomId: v.roomId,
      checkIn: v.start,
      checkOut: v.end,
      rooms: v.rooms,
      adults: v.adults,
      children: v.children,
    };
    const quote = await hotelQuote(b.hotelId, stay);
    subtotal = quote.subtotal;
    tax = quote.tax;
    snapshot = {
      ...snapshot,
      stay,
      quoteToken: quote.quoteToken,
      policies: quote.policies + "\n" + quote.cancellationPolicy,
    };
  } else {
    if (!v.vehicleId || v.roomId) throw new HttpError(400, "Choose a vehicle");
    const r = await u.row<Vehicle>("MPVehicle", v.vehicleId);
    if (r.businessId !== b.id || !r.active || v.capacity > r.capacity)
      throw new HttpError(409, "Vehicle unavailable or capacity exceeded");
    await available(u, r.id, v.start, v.end);
    subtotal =
      r.ratePaise * (r.pricing === "TRIP" ? 1 : Math.max(v.km, r.minKm));
    if (!Number.isSafeInteger(subtotal) || subtotal > 10000000000)
      throw new HttpError(400, "Quote exceeds supported amount");
    tax = rounded(subtotal, r.taxBps);
    snapshot = {
      ...snapshot,
      vehicleRevision: r.revision,
      policies: r.policies,
    };
  }
  const token = digest({
    selection: v,
    businessRevision: b.revision,
    snapshot,
    subtotal,
    tax,
    origin,
    agencyId,
  });
  return {
    v,
    b,
    agencyId,
    origin,
    subtotal,
    tax,
    total: subtotal + tax,
    snapshot,
    quoteToken: token,
  };
}
export async function bookingQuote(userId: string, input: unknown) {
  const q = await quoteInUnit(new Unit(), userId, input);
  return {
    selection: q.v,
    supplier: q.b.name,
    subtotal: q.subtotal,
    tax: q.tax,
    total: q.total,
    currency: "INR",
    policies: q.snapshot.policies,
    paymentTerms: q.snapshot.paymentTerms,
    quoteToken: q.quoteToken,
    commissionEligible: q.snapshot.eligible,
    commissionBps: q.snapshot.agreement.commissionBps,
  };
}
export async function requestBooking(userId: string, input: unknown) {
  const v = z
    .object({
      selection,
      quoteToken: z.string().regex(/^[a-f0-9]{64}$/),
      requestKey: z.uuid(),
      customer: z.string().trim().min(2).max(100),
      phone,
      email: z.union([z.email().max(254), z.literal("")]),
      consent: z.literal(true),
    })
    .strict()
    .parse(input);
  const u = new Unit();
  const actor = await identity(u, userId, true);
  const payloadHash = digest(v);
  const prior = await u.db
    .prepare("SELECT * FROM MPBooking WHERE requesterId=? AND requestKey=?")
    .bind(userId, v.requestKey)
    .first<Booking>();
  if (prior) {
    if (prior.agencyId && prior.agencyId !== actor.agencyId)
      throw new HttpError(404, "Booking not found");
    if (prior.payloadHash !== payloadHash)
      throw new HttpError(
        409,
        "Idempotency key already used for a different request",
      );
    return { bookingId: prior.id, status: effective(prior), replayed: true };
  }
  const q = await quoteInUnit(u, userId, v.selection);
  if (q.quoteToken !== v.quoteToken)
    throw new HttpError(409, "Quote changed. Review the new price and terms");
  await limit(u, q.b, true);
  u.guard(
    "SELECT COUNT(*)=0 FROM MPBooking WHERE requesterId=? AND requestKey=?",
    userId,
    v.requestKey,
  );
  const key = randomUUID();
  u.writes.push({
    sql: "INSERT INTO MPBooking(id,businessId,requesterId,agencyId,requestKey,payloadHash,origin,vehicleId,start,end,route,capacity,km,customer,phone,email,consentAt,subtotal,discount,tax,total,snapshot,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)",
    values: [
      key,
      q.b.id,
      userId,
      q.agencyId,
      v.requestKey,
      payloadHash,
      q.origin,
      q.v.vehicleId || null,
      q.v.start,
      q.v.end,
      q.v.route,
      q.v.capacity,
      q.v.km,
      v.customer,
      v.phone,
      v.email,
      now(),
      q.subtotal,
      q.tax,
      q.total,
      JSON.stringify(q.snapshot),
      now(),
    ],
  });
  u.audit(userId, q.b.id, "BOOKING_REQUESTED", {
    bookingId: key,
    origin: q.origin,
  });
  u.usage(q.b.id, true);
  await u.commit();
  return {
    bookingId: key,
    status: "REQUESTED",
    message:
      "Request saved. Inventory is not reserved until the supplier creates a hold.",
  };
}
async function available(
  u: Unit,
  vehicleId: string,
  start: string,
  end: string,
  ignore = "",
) {
  const sql =
    "SELECT COUNT(*)=0 AS ok FROM MPBooking WHERE vehicleId=? AND id<>? AND start<? AND end>? AND (status IN('CONFIRMED','COMPLETED') OR (status='HELD' AND holdUntil>?))";
  const values = [vehicleId, ignore, end, start, now()];
  const row = await u.db
    .prepare(sql)
    .bind(...values)
    .first<{ ok: number }>();
  if (!row?.ok)
    throw new HttpError(409, "Vehicle already reserved for these dates");
  u.guard(sql, ...values);
  const blocks =
    "SELECT COUNT(*)=0 AS ok FROM MPBlackout WHERE vehicleId=? AND start<? AND end>?";
  if (
    !(
      await u.db
        .prepare(blocks)
        .bind(vehicleId, end, start)
        .first<{ ok: number }>()
    )?.ok
  )
    throw new HttpError(409, "Vehicle is unavailable on these dates");
  u.guard(blocks, vehicleId, end, start);
}
const change = z
  .object({
    bookingId: id,
    revision: z.number().int().min(0),
    action: z.enum([
      "hold",
      "confirm",
      "complete",
      "cancel",
      "expire",
      "driver",
      "expense",
    ]),
    driverId: id.optional(),
    expense: z.number().int().min(0).max(10000000000).optional(),
  })
  .strict();
export async function changeBooking(userId: string, input: unknown) {
  const v = change.parse(input),
    u = new Unit();
  const actor = await identity(u, userId, true);
  const b = await u.row<Booking>("MPBooking", v.bookingId),
    supplier = await u.row<Business>("MPBusiness", b.businessId);
  const supplierActor = supplier.ownerId === userId;
  const requester =
    b.requesterId === userId && (!b.agencyId || b.agencyId === actor.agencyId);
  if (!supplierActor && !requester)
    throw new HttpError(404, "Booking not found");
  if (v.revision !== b.revision)
    throw new HttpError(409, "Booking changed. Refresh first");
  const state = effective(b),
    snapshot = JSON.parse(b.snapshot) as Snapshot;
  if (v.action === "cancel") {
    if (!["REQUESTED", "HELD", "EXPIRED"].includes(state))
      throw new HttpError(
        409,
        "Confirmed cancellations require admin payment/refund review",
      );
    if (b.hotelStayId) {
      u.guard(
        "SELECT COUNT(*)=1 FROM \"HotelStayRequest\" s WHERE s.id=? AND s.status IN('HELD','EXPIRED','CANCELLED') AND NOT EXISTS(SELECT 1 FROM \"HotelPaymentAttempt\" a WHERE a.\"stayId\"=s.id AND a.status<>'FAILED_NO_ORDER')",
        b.hotelStayId,
      );
      u.writes.push({
        sql: "UPDATE \"HotelStayRequest\" SET status='CANCELLED',revision=revision+1 WHERE id=?",
        values: [b.hotelStayId],
      });
    }
    update(u, "MPBooking", b.id, { status: "CANCELLED" });
  } else if (v.action === "expire") {
    if (state !== "EXPIRED")
      throw new HttpError(409, "Only expired holds can be expired");
    update(u, "MPBooking", b.id, { status: "EXPIRED" });
  } else {
    if (!supplierActor)
      throw new HttpError(403, "Supplier owner permission required");
    await own(u, userId, supplier.id);
    if (supplier.status !== "APPROVED")
      throw new HttpError(403, "Approved business required");
    await limit(u, supplier);
    if (v.action === "hold") {
      if (state !== "REQUESTED")
        throw new HttpError(409, "Only a requested booking can be held");
      const until = new Date(Date.now() + 15 * 60000).toISOString();
      if (snapshot.kind === "HOTEL") {
        if (!supplier.hotelId || !snapshot.stay || !snapshot.quoteToken)
          throw new HttpError(409, "Hotel quote missing");
        const result = await holdHotelRoom(
          supplier.hotelId,
          {
            stay: snapshot.stay,
            quoteToken: snapshot.quoteToken,
            requestId: b.id,
            customer: b.customer,
            phone: b.phone,
            email: b.email,
            consent: true,
            confirmed: true,
            attribution: { source: "travelos-marketplace", ref: b.id },
          },
          hotelCapability(b),
          async (hotelUnit, stay) => {
            hotelUnit.guards.push(...u.guards);
            hotelUnit.writes.push(...u.writes, {
              sql: "UPDATE MPBooking SET status='HELD',hotelStayId=?,holdUntil=?,revision=revision+1 WHERE id=?",
              values: [stay.id, stay.holdUntil, b.id],
            });
            u.audit(userId, supplier.id, "BOOKING_HELD", { bookingId: b.id });
            hotelUnit.writes.push(...u.writes.slice(u.writes.length - 1));
          },
        );
        return { bookingId: b.id, status: "HELD", holdUntil: result.holdUntil };
      }
      const vehicle = await u.row<Vehicle>("MPVehicle", b.vehicleId!);
      if (
        vehicle.businessId !== supplier.id ||
        !vehicle.active ||
        vehicle.revision !== snapshot.vehicleRevision
      )
        throw new HttpError(
          409,
          "Vehicle price or terms changed. Request a fresh quote",
        );
      await available(u, vehicle.id, b.start, b.end, b.id);
      update(u, "MPBooking", b.id, { status: "HELD", holdUntil: until });
    } else if (v.action === "confirm") {
      if (state !== "HELD")
        throw new HttpError(409, "A valid unexpired hold is required");
      u.guard(
        "SELECT COUNT(*)=1 FROM MPBooking WHERE id=? AND status='HELD' AND julianday(holdUntil)>julianday('now')",
        b.id,
      );
      if (b.hotelStayId) {
        const stay = await u.db
          .prepare(
            'SELECT status,"paymentStatus" FROM "HotelStayRequest" WHERE id=?',
          )
          .bind(b.hotelStayId)
          .first<{ status: string; paymentStatus: string }>();
        if (stay?.status !== "CONFIRMED" || stay.paymentStatus !== "VERIFIED")
          throw new HttpError(
            409,
            "Hotel requires provider-verified live payment and native confirmation; sandbox completion is not a booking",
          );
        u.guard(
          "SELECT COUNT(*)=1 FROM \"HotelStayRequest\" WHERE id=? AND status='CONFIRMED' AND \"paymentStatus\"='VERIFIED'",
          b.hotelStayId,
        );
        update(u, "MPBooking", b.id, {
          status: "CONFIRMED",
          paymentStatus: "PROVIDER_VERIFIED",
        });
      } else {
        await available(u, b.vehicleId!, b.start, b.end, b.id);
        update(u, "MPBooking", b.id, { status: "CONFIRMED" });
      }
    } else if (v.action === "complete") {
      if (state !== "CONFIRMED" || b.end > now().slice(0, 10))
        throw new HttpError(
          409,
          "Complete a confirmed booking only after its end date",
        );
      update(u, "MPBooking", b.id, { status: "COMPLETED" });
      ledger(u, b, "earned:" + b.id, "EARNED", commission(b, snapshot));
    } else if (v.action === "driver") {
      if (!v.driverId || !["HELD", "CONFIRMED"].includes(state) || !b.vehicleId)
        throw new HttpError(
          409,
          "Assign a driver to a held or confirmed charter",
        );
      const driver = await u.row<{ businessId: string; active: number }>(
        "MPDriver",
        v.driverId,
      );
      if (driver.businessId !== supplier.id || !driver.active)
        throw new HttpError(404, "Driver unavailable");
      u.guard(
        "SELECT COUNT(*)=0 FROM MPBooking WHERE driverId=? AND id<>? AND start<? AND end>? AND (status IN('CONFIRMED','COMPLETED') OR (status='HELD' AND holdUntil>?))",
        v.driverId,
        b.id,
        b.end,
        b.start,
        now(),
      );
      update(u, "MPBooking", b.id, { driverId: v.driverId });
    } else {
      if (
        v.expense === undefined ||
        !["CONFIRMED", "COMPLETED"].includes(state)
      )
        throw new HttpError(
          409,
          "Record expenses against confirmed/completed bookings",
        );
      update(u, "MPBooking", b.id, { expense: v.expense });
    }
  }
  u.audit(userId, b.businessId, "BOOKING_" + v.action.toUpperCase(), {
    bookingId: b.id,
  });
  u.usage(b.businessId);
  await u.commit();
  return {
    bookingId: b.id,
    message: "Saved. No charge, transfer or refund was executed.",
  };
}
