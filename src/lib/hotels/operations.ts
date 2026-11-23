import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../http";
import { calendarDate } from "../reporting-time";
import { hotelUnit, ownedHotel, hotelAudit } from "./d1-foundation";
import { requireHotelBooking } from "./booking";
import { occupancyPlanning } from "../workspace-operations/occupancy-baseline";
import { seasonalBaseline } from "../workspace-operations/baseline";
function enabled() {
  requireHotelBooking();
  if (process.env.WORKSPACE_OPERATIONS_ENABLED !== "true")
    throw new HttpError(404, "Hotel guest operations are not enabled");
}
const key = z.string().min(1).max(100);
const command = z
  .object({
    hotelId: key,
    stayId: key,
    action: z.enum(["CHECK_IN", "CHECK_OUT"]),
    revision: z.number().int().min(0),
    requestId: z.uuid(),
    reviewed: z.literal(true),
  })
  .strict();
type Stay = {
  id: string;
  hotelId: string;
  status: string;
  paymentStatus: string;
  checkIn: string;
  checkOut: string;
  revision: number;
};
type Presence = {
  stayId: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  revision: number;
};
export async function hotelGuestCommand(userId: string, input: unknown) {
  enabled();
  const v = command.parse(input),
    unit = await hotelUnit(userId),
    { hotel } = await ownedHotel(unit, userId, v.hotelId);
  if (v.action === "CHECK_IN" && hotel.status !== "APPROVED")
    throw new HttpError(409, "Guest check-in requires an approved property");
  const stay = await unit.db
    .prepare(
      'SELECT id,"hotelId",status,"paymentStatus","checkIn","checkOut",revision FROM "HotelStayRequest" WHERE id=? AND "hotelId"=?',
    )
    .bind(v.stayId, v.hotelId)
    .first<Stay>();
  if (!stay) throw new HttpError(404, "Reservation not found");
  const hash = createHash("sha256")
    .update(JSON.stringify({ userId, ...v }))
    .digest("hex");
  const replay = await unit.db
    .prepare(
      'SELECT "payloadHash" FROM "HotelGuestStayEvent" WHERE "hotelId"=? AND "requestId"=?',
    )
    .bind(v.hotelId, v.requestId)
    .first<{ payloadHash: string }>();
  if (replay) {
    if (replay.payloadHash !== hash)
      throw new HttpError(
        409,
        "Request key already used for different guest operations",
      );
    return { message: "Guest operation was already recorded.", replayed: true };
  }
  const presence = await unit.db
    .prepare('SELECT * FROM "HotelGuestStay" WHERE "stayId"=? AND "hotelId"=?')
    .bind(v.stayId, v.hotelId)
    .first<Presence>();
  const stamp = new Date().toISOString(),
    today = calendarDate(new Date(), hotel.timezone);
  if (stay.revision !== v.revision)
    throw new HttpError(
      409,
      "Reservation changed. Reload before recording guest operations",
    );
  if (stay.status !== "CONFIRMED" || stay.paymentStatus !== "VERIFIED")
    throw new HttpError(
      409,
      "Only a confirmed, provider-verified reservation supports guest operations. Holds and sandbox bookings cannot be checked in",
    );
  unit.guard(
    'SELECT COUNT(*)=1 FROM "HotelStayRequest" WHERE id=? AND "hotelId"=? AND revision=? AND status=\'CONFIRMED\' AND "paymentStatus"=\'VERIFIED\'',
    v.stayId,
    v.hotelId,
    v.revision,
  );
  if (v.action === "CHECK_IN") {
    if (presence)
      throw new HttpError(409, "Guest check-in has already been recorded");
    if (today < stay.checkIn || today >= stay.checkOut)
      throw new HttpError(
        409,
        "Check-in must occur during the reserved hotel-local date window",
      );
    unit.guard(
      'SELECT COUNT(*)=0 FROM "HotelGuestStay" WHERE "stayId"=?',
      v.stayId,
    );
    unit.writes.push({
      sql: 'INSERT INTO "HotelGuestStay" ("stayId","hotelId","checkedInAt","checkedInBy",revision) VALUES (?,?,?,?,0)',
      values: [v.stayId, v.hotelId, stamp, userId],
    });
  } else {
    if (!presence || presence.checkedOutAt)
      throw new HttpError(
        409,
        "Record check-in first; check-out can only be recorded once",
      );
    unit.guard(
      'SELECT COUNT(*)=1 FROM "HotelGuestStay" WHERE "stayId"=? AND "hotelId"=? AND revision=? AND "checkedOutAt" IS NULL',
      v.stayId,
      v.hotelId,
      presence.revision,
    );
    unit.writes.push({
      sql: 'UPDATE "HotelGuestStay" SET "checkedOutAt"=?,"checkedOutBy"=?,revision=revision+1 WHERE "stayId"=? AND "hotelId"=?',
      values: [stamp, userId, v.stayId, v.hotelId],
    });
  }
  unit.writes.push({
    sql: 'INSERT INTO "HotelGuestStayEvent" (id,"hotelId","stayId",action,"actorId","requestId","payloadHash","createdAt") VALUES (?,?,?,?,?,?,?,?)',
    values: [
      randomUUID(),
      v.hotelId,
      v.stayId,
      v.action,
      userId,
      v.requestId,
      hash,
      stamp,
    ],
  });
  hotelAudit(unit, v.hotelId, userId, v.action, hotel.revision, {
    stayId: v.stayId,
  });
  await unit.commit();
  return {
    message:
      v.action === "CHECK_IN"
        ? "Guest check-in recorded. Booking and payment state unchanged."
        : "Guest check-out recorded. Reserved nights remain unchanged; refunds and settlement require separate review.",
    replayed: false,
  };
}
export async function hotelOperationsOverview(
  userId: string,
  hotelId: string,
  month: string,
  includeGuests = true,
) {
  enabled();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new HttpError(400, "Select a valid month");
  const unit = await hotelUnit(userId),
    { hotel } = await ownedHotel(unit, userId, hotelId),
    from = month + "-01",
    to = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
    )
      .toISOString()
      .slice(0, 10);
  const guests = includeGuests
    ? (
        await unit.db
          .prepare(
            'SELECT s.id,s."roomId",s.customer,s.phone,s.email,s."checkIn",s."checkOut",s.rooms,s.adults,s.children,s.status,s."paymentStatus",s.revision,g."checkedInAt",g."checkedOutAt",r.name AS "roomName" FROM "HotelStayRequest" s LEFT JOIN "HotelGuestStay" g ON g."stayId"=s.id AND g."hotelId"=s."hotelId" JOIN "HotelRoomCategory" r ON r.id=s."roomId" AND r."hotelId"=s."hotelId" WHERE s."hotelId"=? AND ((s."checkIn"<? AND s."checkOut">?) OR (g."checkedInAt" IS NOT NULL AND g."checkedOutAt" IS NULL)) ORDER BY s."checkIn",s.id LIMIT 201',
          )
          .bind(hotelId, to, from)
          .all<Record<string, unknown>>()
      ).results
    : [];
  const nights = (
    await unit.db
      .prepare(
        'SELECT n.day,SUM(n.allotment) AS allotment, (SELECT COALESCE(SUM(sn.rooms),0) FROM "HotelStayNight" sn JOIN "HotelStayRequest" s ON s.id=sn."stayId" WHERE s."hotelId"=? AND sn.day=n.day AND s.status=\'CONFIRMED\' AND s."paymentStatus"=\'VERIFIED\') AS booked FROM "HotelRoomNight" n WHERE n."hotelId"=? AND n.day>=? AND n.day<? GROUP BY n.day ORDER BY n.day',
      )
      .bind(hotelId, hotelId, from, to)
      .all<{ day: string; allotment: number; booked: number }>()
  ).results;
  const revenue = await unit.db
    .prepare(
      'SELECT COALESCE(SUM(p.amount),0) AS gross,COUNT(*) AS captures FROM "HotelPaymentAttempt" p JOIN "HotelMerchant" m ON m.id=p."merchantId" JOIN "HotelStayRequest" s ON s.id=p."stayId" AND s."hotelId"=p."hotelId" WHERE p."hotelId"=? AND p.status=\'CAPTURED\' AND s."paymentStatus" IN(\'VERIFIED\',\'REFUND_REVIEW\') AND p."verifiedAt">=? AND p."verifiedAt"<?',
    )
    .bind(hotelId, from + "T00:00:00.000Z", to + "T00:00:00.000Z")
    .first<{ gross: number; captures: number }>();
  const today = calendarDate(new Date(), hotel.timezone),
    history = (
      await unit.db
        .prepare(
          'SELECT substr("createdAt",1,10) AS day,COUNT(*) AS count FROM "HotelStayRequest" WHERE "hotelId"=? AND "createdAt">=? GROUP BY substr("createdAt",1,10) ORDER BY day',
        )
        .bind(hotelId, new Date(Date.now() - 180 * 86400000).toISOString())
        .all<{ day: string; count: number }>()
    ).results;
  const shift = (n: number) =>
    new Date(Date.parse(today + "T00:00:00Z") + n * 86400000)
      .toISOString()
      .slice(0, 10);
  const occupancyHistory = (
    await unit.db
      .prepare(
        'SELECT n.day,SUM(n.allotment) AS allotment,(SELECT COALESCE(SUM(sn.rooms),0) FROM "HotelStayNight" sn JOIN "HotelStayRequest" s ON s.id=sn."stayId" WHERE s."hotelId"=? AND sn.day=n.day AND s.status=\'CONFIRMED\' AND s."paymentStatus"=\'VERIFIED\') AS booked FROM "HotelRoomNight" n WHERE n."hotelId"=? AND n.day>=? AND n.day<? GROUP BY n.day ORDER BY n.day',
      )
      .bind(hotelId, hotelId, shift(-70), today)
      .all<{ day: string; allotment: number; booked: number }>()
  ).results;
  const futureCapacity = (
    await unit.db
      .prepare(
        'SELECT day,SUM(allotment) AS allotment FROM "HotelRoomNight" WHERE "hotelId"=? AND day>=? AND day<? GROUP BY day',
      )
      .bind(hotelId, today, shift(90))
      .all<{ day: string; allotment: number }>()
  ).results;
  return {
    month,
    timezone: hotel.timezone,
    guests: guests.slice(0, 200),
    truncated: guests.length > 200,
    nights,
    revenue,
    occupancyOutlook: occupancyPlanning(
      occupancyHistory,
      futureCapacity,
      shift(-1),
    ),
    baseline: seasonalBaseline(
      history,
      new Date().toISOString().slice(0, 10),
      [
        hotel.createdAt.toISOString().slice(0, 10),
        new Date(Date.now() - 179 * 86400000).toISOString().slice(0, 10),
      ].sort()[1],
    ),
    notes:
      "Booked occupancy is confirmed provider-verified room nights divided by explicitly configured allotment; it is not physical guest occupancy. Capture totals are gross, by UTC verification month, and do not subtract later provider refunds. Reconcile provider statements before reporting net revenue.",
  };
}
