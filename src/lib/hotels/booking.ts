import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Hotel, HotelRoomCategory } from "@prisma/client";
import { db, d1Binding } from "../db";
import { HttpError } from "../http";
import { calendarDate } from "../reporting-time";
import { D1Unit } from "../d1/unit";
import { requireHotels } from "./service";
import { hotelUnit, ownedHotel, hotelAudit } from "./d1-foundation";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function requireHotelBooking() {
  requireHotels();
  if (process.env.HOTEL_BOOKING_ENABLED !== "true" || !d1Binding())
    throw new HttpError(404, "Hotel reservations are not enabled");
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  }, "Use a valid calendar date");
export const staySchema = z
  .object({
    roomId: z.string().min(1).max(100),
    checkIn: date,
    checkOut: date,
    rooms: z.number().int().min(1).max(10),
    adults: z.number().int().min(1).max(100),
    children: z.number().int().min(0).max(100),
  })
  .strict();
export type StayInput = z.infer<typeof staySchema>;
type Night = {
  hotelId: string;
  roomId: string;
  day: string;
  allotment: number;
  ratePaise: number;
  minStay: number;
  closed: number;
  revision: number;
};
export function nightsBetween(start: string, end: string) {
  const out: string[] = [];
  let t = +new Date(start + "T00:00:00Z"),
    finish = +new Date(end + "T00:00:00Z");
  if (
    !Number.isFinite(t) ||
    !Number.isFinite(finish) ||
    finish <= t ||
    (finish - t) / 86400000 > 30
  )
    throw new HttpError(400, "Choose a stay of 1 to 30 nights");
  for (; t < finish; t += 86400000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
export async function redactExpiredHotelChats(hotelId: string) {
  await d1Binding()!
    .prepare(
      "UPDATE \"HotelChatSession\" SET messages='[]',memory='{}',\"secretHash\"='redacted:'||id,status='REDACTED',revision=revision+1 WHERE \"hotelId\"=? AND \"expiresAt\"<=? AND status<>'REDACTED'",
    )
    .bind(hotelId, new Date().toISOString())
    .run();
}
export async function publicHotel(id: string) {
  requireHotelBooking();
  await redactExpiredHotelChats(id);
  const h = await db.hotel.findFirst({
    where: { id, status: "APPROVED" },
    include: { rooms: { where: { active: true }, orderBy: { name: "asc" } } },
  });
  if (!h) throw new HttpError(404, "This verified hotel is not available");
  const payment = await d1Binding()!
    .prepare('SELECT mode FROM "HotelMerchant" WHERE "hotelId"=?')
    .bind(id)
    .first<{ mode: string }>();
  return {
    checkoutAvailable:
      !!payment &&
      (payment.mode === "test" ||
        process.env.HOTEL_LIVE_PAYMENTS_APPROVED === "true"),
    paymentMode: payment?.mode || null,
    id: h.id,
    name: h.name,
    city: h.city,
    region: h.region,
    address: h.address,
    contactPhone: h.contactPhone,
    contactEmail: h.contactEmail,
    amenities: h.amenities,
    photoUrls: h.photoUrls,
    policies: h.policies,
    cancellationPolicy: h.cancellationPolicy,
    taxBps: h.taxBps,
    timezone: h.timezone,
    rooms: h.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      amenities: r.amenities,
      maxAdults: r.maxAdults,
      maxChildren: r.maxChildren,
      maxOccupancy: r.maxOccupancy,
    })),
  };
}
export async function publicHotels(destination = "") {
  requireHotelBooking();
  return db.hotel.findMany({
    where: {
      status: "APPROVED",
      ...(destination
        ? { city: { contains: destination.trim().slice(0, 100) } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      city: true,
      region: true,
      amenities: true,
      photoUrls: true,
    },
    take: 50,
    orderBy: { name: "asc" },
  });
}
async function quoteInUnit(unit: D1Unit, hotelId: string, input: unknown) {
  const v = staySchema.parse(input),
    hotel = (await unit.read<Hotel>("Hotel", '"id"=?', [hotelId]))[0];
  if (!hotel || hotel.status !== "APPROVED")
    throw new HttpError(404, "Verified hotel unavailable");
  const room = (
    await unit.read<HotelRoomCategory>(
      "HotelRoomCategory",
      '"id"=? AND "hotelId"=?',
      [v.roomId, hotelId],
    )
  )[0];
  if (!room || !room.active)
    throw new HttpError(404, "Room category unavailable");
  if (
    v.adults < v.rooms ||
    v.adults > room.maxAdults * v.rooms ||
    v.children > room.maxChildren * v.rooms ||
    v.adults + v.children > room.maxOccupancy * v.rooms
  )
    throw new HttpError(
      400,
      "Guests exceed this room category occupancy or each room needs an adult",
    );
  const days = nightsBetween(v.checkIn, v.checkOut),
    today = calendarDate(new Date(), hotel.timezone);
  if (
    v.checkIn < today ||
    v.checkIn > new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
  )
    throw new HttpError(400, "Choose check-in within the next year");
  const rows = (
    await unit.db
      .prepare(
        'SELECT * FROM "HotelRoomNight" WHERE "hotelId"=? AND "roomId"=? AND day>=? AND day<? ORDER BY day',
      )
      .bind(hotelId, room.id, v.checkIn, v.checkOut)
      .all<Night>()
  ).results;
  if (
    rows.length !== days.length ||
    rows.some(
      (n, i) => n.day !== days[i] || n.closed || days.length < n.minStay,
    )
  )
    throw new HttpError(
      409,
      "This room is not available for every selected night",
    );
  const now = new Date().toISOString();
  let subtotal = 0,
    available = room.totalRooms;
  const usedRows = (
    await unit.db
      .prepare(
        `SELECT n.day,SUM(n.rooms) used FROM "HotelStayNight" n JOIN "HotelStayRequest" s ON s.id=n."stayId" AND s."hotelId"=n."hotelId" WHERE n."hotelId"=? AND n."roomId"=? AND n.day>=? AND n.day<? AND (s.status='CONFIRMED' OR (s.status='HELD' AND s."holdUntil">?)) GROUP BY n.day`,
      )
      .bind(hotelId, room.id, v.checkIn, v.checkOut, now)
      .all<{ day: string; used: number }>()
  ).results;
  const usedByDay = new Map(usedRows.map((n) => [n.day, Number(n.used)]));
  for (const n of rows) {
    const used = usedByDay.get(n.day) || 0;
    if (n.allotment > room.totalRooms || n.allotment - used < v.rooms)
      throw new HttpError(409, "Not enough rooms remain for these dates");
    available = Math.min(available, n.allotment - used);
    subtotal += n.ratePaise * v.rooms;
  }
  // Guard every nightly revision and aggregate capacity inside the same native
  // batch without issuing two queries per night (important on Workers Free).
  unit.guard(
    `SELECT COUNT(*)=? FROM "HotelRoomNight" n JOIN json_each(?) j ON n.day=json_extract(j.value,'$.day') AND n.revision=json_extract(j.value,'$.revision') WHERE n."hotelId"=? AND n."roomId"=?`,
    rows.length,
    JSON.stringify(rows.map((n) => ({ day: n.day, revision: n.revision }))),
    hotelId,
    room.id,
  );
  unit.guard(
    `SELECT COUNT(*)=0 FROM "HotelRoomNight" r WHERE r."hotelId"=? AND r."roomId"=? AND r.day>=? AND r.day<? AND r.allotment < ? + (SELECT COALESCE(SUM(n.rooms),0) FROM "HotelStayNight" n JOIN "HotelStayRequest" s ON s.id=n."stayId" AND s."hotelId"=n."hotelId" WHERE n."hotelId"=r."hotelId" AND n."roomId"=r."roomId" AND n.day=r.day AND (s.status='CONFIRMED' OR (s.status='HELD' AND s."holdUntil">?)))`,
    hotelId,
    room.id,
    v.checkIn,
    v.checkOut,
    v.rooms,
    now,
  );
  const tax = Number(
      (BigInt(subtotal) * BigInt(hotel.taxBps) + 5000n) / 10000n,
    ),
    total = subtotal + tax;
  if (!Number.isSafeInteger(total) || total > 1000000000)
    throw new HttpError(400, "Stay total exceeds online quotation limit");
  const token = hash(
    JSON.stringify({
      hotelId,
      hotelRevision: hotel.revision,
      roomUpdatedAt: room.updatedAt,
      ...v,
      nights: rows.map((n) => [n.day, n.revision, n.ratePaise]),
      subtotal,
      tax,
      total,
    }),
  );
  return {
    hotel,
    room,
    rows,
    v,
    quote: {
      ...v,
      hotelId,
      hotelName: hotel.name,
      roomName: room.name,
      nights: days.length,
      availableRooms: available,
      subtotal,
      tax,
      total,
      currency: "INR",
      quoteToken: token,
      policies: hotel.policies,
      cancellationPolicy: hotel.cancellationPolicy,
      availabilityCheckedAt: now,
    },
  };
}
export async function hotelQuote(hotelId: string, input: unknown) {
  requireHotelBooking();
  return (await quoteInUnit(new D1Unit(d1Binding()!), hotelId, input)).quote;
}
const holdSchema = z
  .object({
    stay: staySchema,
    quoteToken: z.string().regex(/^[a-f0-9]{64}$/),
    requestId: z.uuid(),
    customer: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    email: z.union([z.email().max(254), z.literal("")]),
    consent: z.literal(true),
    confirmed: z.literal(true),
    attribution: z
      .object({
        source: z.string().max(80).optional(),
        campaign: z.string().max(120).optional(),
        ref: z.string().max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export async function holdHotelRoom(
  hotelId: string,
  input: unknown,
  existingSecret?: string,
  onReserved?: (
    unit: D1Unit,
    stay: { id: string; holdUntil: string },
  ) => Promise<void>,
) {
  requireHotelBooking();
  const v = holdSchema.parse(input),
    unit = new D1Unit(d1Binding()!),
    requestHash = hash(JSON.stringify(v));
  const prior = await unit.db
    .prepare(
      'SELECT * FROM "HotelStayRequest" WHERE "hotelId"=? AND "requestId"=?',
    )
    .bind(hotelId, v.requestId)
    .first<Record<string, unknown>>();
  if (prior) {
    if (
      prior.requestHash !== requestHash ||
      !existingSecret ||
      prior.secretHash !== hash(existingSecret)
    )
      throw new HttpError(
        409,
        "Reservation request already exists. Reopen your saved request.",
      );
    return { secret: existingSecret, ...publicStay(prior) };
  }
  if (existingSecret) {
    const capHash = hash(existingSecret),
      now = new Date().toISOString();
    const active = await unit.db
      .prepare(
        'SELECT COUNT(*) AS n FROM "HotelStayRequest" WHERE "hotelId"=? AND "secretHash"=? AND status=\'HELD\' AND "holdUntil">?',
      )
      .bind(hotelId, capHash, now)
      .first<{ n: number }>();
    if (active?.n)
      throw new HttpError(
        409,
        "You already have a temporary hold. Reopen or release it before requesting another.",
      );
    unit.guard(
      'SELECT COUNT(*)=0 FROM "HotelStayRequest" WHERE "hotelId"=? AND "secretHash"=? AND status=\'HELD\' AND "holdUntil">?',
      hotelId,
      capHash,
      now,
    );
  }
  unit.guard(
    'SELECT COUNT(*)=0 FROM "HotelStayRequest" WHERE "hotelId"=? AND "requestId"=?',
    hotelId,
    v.requestId,
  );
  const { quote, rows } = await quoteInUnit(unit, hotelId, v.stay);
  if (quote.quoteToken !== v.quoteToken)
    throw new HttpError(
      409,
      "Prices or terms changed. Review a fresh quotation before proceeding.",
    );
  const id = randomUUID(),
    secret = existingSecret || randomBytes(32).toString("base64url"),
    now = new Date().toISOString(),
    holdUntil = new Date(Date.now() + 15 * 60000).toISOString();
  unit.writes.push({
    sql: 'INSERT INTO "HotelStayRequest" (id,"hotelId","roomId","requestId","requestHash","secretHash","checkIn","checkOut",rooms,adults,children,customer,phone,email,subtotal,tax,total,"termsSnapshot","consentAt","holdUntil",attribution,"createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    values: [
      id,
      hotelId,
      v.stay.roomId,
      v.requestId,
      requestHash,
      hash(secret),
      v.stay.checkIn,
      v.stay.checkOut,
      v.stay.rooms,
      v.stay.adults,
      v.stay.children,
      v.customer,
      v.phone,
      v.email,
      quote.subtotal,
      quote.tax,
      quote.total,
      JSON.stringify({
        hotelName: quote.hotelName,
        roomName: quote.roomName,
        policies: quote.policies,
        cancellationPolicy: quote.cancellationPolicy,
      }),
      now,
      holdUntil,
      JSON.stringify(v.attribution || {}),
      now,
    ],
  });
  unit.writes.push({
    sql: `INSERT INTO "HotelStayNight" ("stayId","hotelId","roomId",day,rooms,"ratePaise") SELECT ?,?,?,json_extract(value,'$.day'),?,json_extract(value,'$.ratePaise') FROM json_each(?)`,
    values: [
      id,
      hotelId,
      v.stay.roomId,
      v.stay.rooms,
      JSON.stringify(rows.map((n) => ({ day: n.day, ratePaise: n.ratePaise }))),
    ],
  });
  hotelAudit(unit, hotelId, "customer", "ROOM_HOLD_CREATED", 0, {
    stayId: id,
    rooms: v.stay.rooms,
    checkIn: v.stay.checkIn,
    checkOut: v.stay.checkOut,
    total: quote.total,
  });
  if (onReserved) await onReserved(unit, { id, holdUntil });
  await unit.commit();
  return {
    secret,
    ...publicStay({
      id,
      hotelId,
      ...v.stay,
      status: "HELD",
      paymentStatus: "NOT_INITIATED",
      holdUntil,
      total: quote.total,
    }),
  };
}
function publicStay(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    hotelId: String(row.hotelId),
    checkIn: String(row.checkIn),
    checkOut: String(row.checkOut),
    rooms: Number(row.rooms),
    status:
      row.status === "HELD" && String(row.holdUntil) <= new Date().toISOString()
        ? "EXPIRED"
        : String(row.status),
    paymentStatus: String(row.paymentStatus),
    holdUntil: String(row.holdUntil),
    total: Number(row.total),
    confirmed: row.status === "CONFIRMED" && row.paymentStatus === "VERIFIED",
  };
}
export async function hotelStayStatus(hotelId: string, secret: string) {
  requireHotelBooking();
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret))
    throw new HttpError(401, "Saved reservation unavailable");
  const row = await d1Binding()!
    .prepare(
      'SELECT * FROM "HotelStayRequest" WHERE "hotelId"=? AND "secretHash"=? ORDER BY "createdAt" DESC LIMIT 1',
    )
    .bind(hotelId, hash(secret))
    .first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "Saved reservation not found");
  const m = await d1Binding()!
    .prepare('SELECT mode FROM "HotelMerchant" WHERE "hotelId"=?')
    .bind(hotelId)
    .first<{ mode: string }>();
  return {
    ...publicStay(row),
    checkoutAvailable:
      !!m &&
      (m.mode === "test" ||
        process.env.HOTEL_LIVE_PAYMENTS_APPROVED === "true"),
    paymentMode: m?.mode || null,
  };
}
export async function updateHotelInventory(
  userId: string,
  hotelId: string,
  input: unknown,
) {
  requireHotelBooking();
  const v = z
      .object({
        roomId: z.string().min(1).max(100),
        from: date,
        to: date,
        allotment: z.number().int().min(0).max(10000),
        ratePaise: z.number().int().min(1).max(100000000),
        minStay: z.number().int().min(1).max(30),
        closed: z.boolean(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(input),
    unit = await hotelUnit(userId);
  const { hotel } = await ownedHotel(unit, userId, hotelId);
  if (hotel.status === "SUSPENDED")
    throw new HttpError(403, "Suspended hotel cannot change inventory");
  const room = (
    await unit.read<HotelRoomCategory>(
      "HotelRoomCategory",
      '"id"=? AND "hotelId"=?',
      [v.roomId, hotelId],
    )
  )[0];
  if (!room || v.allotment > room.totalRooms)
    throw new HttpError(400, "Daily allotment cannot exceed physical rooms");
  const days = nightsBetween(v.from, v.to);
  if (v.from < calendarDate(new Date(), hotel.timezone))
    throw new HttpError(400, "Past inventory cannot be changed");
  const capacitySql = `SELECT NOT EXISTS (SELECT n.day FROM "HotelStayNight" n JOIN "HotelStayRequest" s ON s.id=n."stayId" AND s."hotelId"=n."hotelId" WHERE n."hotelId"=? AND n."roomId"=? AND n.day>=? AND n.day<? AND (s.status='CONFIRMED' OR (s.status='HELD' AND s."holdUntil">?)) GROUP BY n.day HAVING SUM(n.rooms)>?) AS ok`;
  const capacityValues = [
    hotelId,
    room.id,
    v.from,
    v.to,
    new Date().toISOString(),
    v.allotment,
  ];
  if (
    !(
      await unit.db
        .prepare(capacitySql)
        .bind(...capacityValues)
        .first<{ ok: number }>()
    )?.ok
  )
    throw new HttpError(
      409,
      "Existing holds or reservations exceed the proposed allotment",
    );
  unit.guard(capacitySql, ...capacityValues);
  unit.writes.push({
    sql: `INSERT INTO "HotelRoomNight" ("hotelId","roomId",day,allotment,"ratePaise","minStay",closed) SELECT ?,?,value,?,?,?,? FROM json_each(?) WHERE 1 ON CONFLICT("roomId",day) DO UPDATE SET allotment=excluded.allotment,"ratePaise"=excluded."ratePaise","minStay"=excluded."minStay",closed=excluded.closed,revision=revision+1`,
    values: [
      hotelId,
      room.id,
      v.allotment,
      v.ratePaise,
      v.minStay,
      v.closed ? 1 : 0,
      JSON.stringify(days),
    ],
  });
  hotelAudit(unit, hotelId, userId, "INVENTORY_UPDATED", hotel.revision, {
    roomId: room.id,
    from: v.from,
    to: v.to,
    allotment: v.allotment,
    ratePaise: v.ratePaise,
    closed: v.closed,
  });
  await unit.commit();
  return {
    message:
      "Date-wise inventory and rates saved. Existing reservation prices remain unchanged.",
  };
}
export async function hotelBookingOverview(userId: string, hotelId: string) {
  requireHotelBooking();
  const unit = await hotelUnit(userId);
  await ownedHotel(unit, userId, hotelId);
  await redactExpiredHotelChats(hotelId);
  return {
    inventory: (
      await unit.db
        .prepare(
          'SELECT * FROM "HotelRoomNight" WHERE "hotelId"=? AND day>=? ORDER BY day LIMIT 500',
        )
        .bind(hotelId, new Date().toISOString().slice(0, 10))
        .all()
    ).results,
    reservations: (
      await unit.db
        .prepare(
          'SELECT id,"roomId","checkIn","checkOut",rooms,adults,children,customer,phone,email,total,status,"paymentStatus","holdUntil","createdAt" FROM "HotelStayRequest" WHERE "hotelId"=? ORDER BY "createdAt" DESC LIMIT 100',
        )
        .bind(hotelId)
        .all()
    ).results,
    conversations: (
      await unit.db
        .prepare(
          'SELECT id,status,messages,memory,"createdAt" FROM "HotelChatSession" WHERE "hotelId"=? AND "expiresAt">? ORDER BY "createdAt" DESC LIMIT 100',
        )
        .bind(hotelId, new Date().toISOString())
        .all()
    ).results,
    paymentEnabled: !!(await unit.db
      .prepare('SELECT id FROM "HotelMerchant" WHERE "hotelId"=?')
      .bind(hotelId)
      .first()),
    merchant: await (await import("./payments")).hotelMerchantOverview(hotelId),
    payments: (
      await unit.db
        .prepare(
          'SELECT "stayId","orderId",amount,status,"paymentId","verifiedAt","lastFailure" FROM "HotelPaymentAttempt" WHERE "hotelId"=? ORDER BY "createdAt" DESC LIMIT 100',
        )
        .bind(hotelId)
        .all()
    ).results,
  };
}

export async function cancelHotelHold(
  hotelId: string,
  secret: string,
  input: unknown,
) {
  requireHotelBooking();
  z.object({ confirmed: z.literal(true) })
    .strict()
    .parse(input);
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret))
    throw new HttpError(401, "Saved reservation unavailable");
  const unit = new D1Unit(d1Binding()!);
  const row = await unit.db
    .prepare(
      'SELECT * FROM "HotelStayRequest" WHERE "hotelId"=? AND "secretHash"=? ORDER BY "createdAt" DESC LIMIT 1',
    )
    .bind(hotelId, hash(secret))
    .first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "Saved reservation not found");
  if (row.status === "HELD" && row.paymentStatus === "PENDING")
    throw new HttpError(
      409,
      "Checkout is active. Contact the hotel or let the hold expire before requesting another room.",
    );
  if (row.status === "HELD" && row.paymentStatus === "NOT_INITIATED") {
    unit.guard(
      'SELECT revision=? FROM "HotelStayRequest" WHERE id=? AND "hotelId"=? AND "secretHash"=?',
      Number(row.revision),
      String(row.id),
      hotelId,
      hash(secret),
    );
    unit.writes.push({
      sql: 'UPDATE "HotelStayRequest" SET status=\'CANCELLED\',revision=revision+1 WHERE id=? AND "hotelId"=?',
      values: [String(row.id), hotelId],
    });
    hotelAudit(
      unit,
      hotelId,
      "customer",
      "ROOM_HOLD_RELEASED",
      Number(row.revision) + 1,
      { stayId: row.id },
    );
    await unit.commit();
  }
  return hotelStayStatus(hotelId, secret);
}
