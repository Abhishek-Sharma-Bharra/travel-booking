import type { Hotel, HotelRoomCategory, User, Agency } from "@prisma/client";
import { d1Binding } from "../db";
import { D1Unit, insertD1, newD1Record, updateD1 } from "../d1/unit";
import { HttpError } from "../http";
import { requireOperator } from "../operator-access";
import { hotelActionSchema, hotelReviewSchema } from "./validation";
export async function hotelUnit(userId: string) {
  const binding = d1Binding();
  if (!binding) throw new HttpError(503, "Native D1 hotel context required");
  const u = new D1Unit(binding);
  const user = (await u.read<User>("User", '"id"=?', [userId]))[0];
  if (!user || user.disabled || !user.emailVerified)
    throw new HttpError(
      403,
      "A verified, enabled account is required for hotel access",
    );
  if (user.agencyId) {
    const agency = (
      await u.read<Agency>("Agency", '"id"=?', [user.agencyId])
    )[0];
    if (agency?.demo)
      throw new HttpError(403, "Demo hotel management is read-only");
  }
  return u;
}
export async function ownedHotel(
  unit: D1Unit,
  userId: string,
  hotelId: string,
) {
  const member = await unit.db
    .prepare('SELECT role FROM "HotelMember" WHERE "hotelId"=? AND "userId"=?')
    .bind(hotelId, userId)
    .first<{ role: string }>();
  if (!member || !["OWNER", "MANAGER"].includes(member.role))
    throw new HttpError(
      404,
      "Hotel not found or editing permission unavailable",
    );
  unit.guard(
    'SELECT COUNT(*)=1 FROM "HotelMember" WHERE "hotelId"=? AND "userId"=? AND role=?',
    hotelId,
    userId,
    member.role,
  );
  const hotel = (await unit.read<Hotel>("Hotel", '"id"=?', [hotelId]))[0];
  if (!hotel) throw new HttpError(404, "Hotel not found");
  return { hotel, role: member.role };
}
export function hotelAudit(
  unit: D1Unit,
  hotelId: string,
  userId: string,
  action: string,
  revision: number,
  details: Record<string, unknown> = {},
) {
  unit.writes.push(
    insertD1(
      "HotelAuditEntry",
      newD1Record("HotelAuditEntry", {
        hotelId,
        actorId: userId,
        action,
        revision,
        details,
      }),
    ),
  );
}
export async function mutateHotelD1(userId: string, input: unknown) {
  const v = hotelActionSchema.parse(input),
    unit = await hotelUnit(userId);
  if (v.action === "create") {
    const count = Number(
      (await unit.db
        .prepare(
          'SELECT COUNT(*) AS n FROM "HotelMember" WHERE "userId"=? AND role=\'OWNER\'',
        )
        .bind(userId)
        .first<{ n: number }>())!.n,
    );
    if (count >= 20)
      throw new HttpError(409, "Property registration limit reached");
    unit.guard(
      'SELECT COUNT(*)=? FROM "HotelMember" WHERE "userId"=? AND role=\'OWNER\'',
      count,
      userId,
    );
    const row = newD1Record("Hotel", v.profile),
      id = String(row.id);
    unit.writes.push(insertD1("Hotel", row), {
      sql: 'INSERT INTO "HotelMember" ("hotelId","userId",role,"createdAt") VALUES (?, ?, \'OWNER\', ?)',
      values: [id, userId, new Date().toISOString()],
    });
    hotelAudit(unit, id, userId, "REGISTERED", 0);
    await unit.commit();
    return { hotelId: id, revision: 0, status: "DRAFT" };
  }
  const { hotel, role } = await ownedHotel(unit, userId, v.hotelId);
  if (hotel.revision !== v.revision)
    throw new HttpError(409, "Hotel changed. Refresh before saving");
  if (hotel.status === "SUSPENDED")
    throw new HttpError(
      403,
      "Suspended property: contact the platform administrator",
    );
  const rooms = await unit.read<HotelRoomCategory>(
      "HotelRoomCategory",
      '"hotelId"=?',
      [hotel.id],
    ),
    revision = hotel.revision + 1;
  let status = "DRAFT";
  if (v.action === "submit") {
    if (role !== "OWNER")
      throw new HttpError(403, "Only the hotel owner can submit verification");
    if (!["DRAFT", "REJECTED"].includes(hotel.status))
      throw new HttpError(
        409,
        "Only draft or rejected properties can be submitted",
      );
    if (
      hotel.address.length < 10 ||
      hotel.city.length < 2 ||
      hotel.region.length < 2 ||
      hotel.policies.length < 20 ||
      hotel.cancellationPolicy.length < 20 ||
      !rooms.some((r) => r.active)
    )
      throw new HttpError(
        400,
        "Complete address, policies and an active room category before submission",
      );
    status = "PENDING";
  } else if (v.action === "room") {
    if (v.roomId) {
      const room = rooms.find((r) => r.id === v.roomId);
      if (!room)
        throw new HttpError(404, "Room category not found in this hotel");
      const conflicts = await unit.db
        .prepare(
          'SELECT COUNT(*) AS n FROM "HotelRoomNight" WHERE "hotelId"=? AND "roomId"=? AND allotment>? AND day>=?',
        )
        .bind(
          hotel.id,
          room.id,
          v.room.totalRooms,
          new Date().toISOString().slice(0, 10),
        )
        .first<{ n: number }>();
      if (conflicts?.n)
        throw new HttpError(
          409,
          "Reduce future daily allotments before reducing total rooms",
        );
      unit.guard(
        'SELECT COUNT(*)=0 FROM "HotelRoomNight" WHERE "hotelId"=? AND "roomId"=? AND allotment>? AND day>=?',
        hotel.id,
        room.id,
        v.room.totalRooms,
        new Date().toISOString().slice(0, 10),
      );
      unit.writes.push(updateD1("HotelRoomCategory", room.id, v.room));
    } else {
      if (rooms.length >= 100)
        throw new HttpError(409, "Room category limit reached");
      unit.writes.push(
        insertD1(
          "HotelRoomCategory",
          newD1Record("HotelRoomCategory", { hotelId: hotel.id, ...v.room }),
        ),
      );
    }
  }
  unit.writes.push(
    updateD1("Hotel", hotel.id, {
      ...(v.action === "profile" ? v.profile : {}),
      status,
      revision,
      reviewReason: "",
      reviewedAt: null,
    }),
  );
  hotelAudit(
    unit,
    hotel.id,
    userId,
    v.action === "submit"
      ? "SUBMITTED"
      : v.action === "profile"
        ? "PROFILE_UPDATED"
        : v.roomId
          ? "ROOM_UPDATED"
          : "ROOM_CREATED",
    revision,
    { previousStatus: hotel.status },
  );
  await unit.commit();
  return { hotelId: hotel.id, revision, status };
}
export async function reviewHotelD1(
  userId: string,
  sessionToken: string,
  input: unknown,
) {
  const v = hotelReviewSchema.parse(input);
  await requireOperator(userId, sessionToken);
  const unit = await hotelUnit(userId);
  unit.guard(
    'SELECT COUNT(*)=1 FROM "Session" WHERE token=? AND "userId"=? AND julianday("expiresAt")>julianday(\'now\') AND julianday("mfaVerifiedAt")>julianday(\'now\',\'-4 hours\')',
    sessionToken,
    userId,
  );
  unit.guard(
    'SELECT COUNT(*)=0 FROM "HotelMember" WHERE "hotelId"=? AND "userId"=?',
    v.hotelId,
    userId,
  );
  const hotel = (await unit.read<Hotel>("Hotel", '"id"=?', [v.hotelId]))[0];
  if (!hotel) throw new HttpError(404, "Hotel not found");
  if (hotel.revision !== v.revision)
    throw new HttpError(409, "Hotel changed. Refresh before reviewing");
  if (
    (v.decision === "SUSPENDED" && hotel.status !== "APPROVED") ||
    (v.decision !== "SUSPENDED" && hotel.status !== "PENDING")
  )
    throw new HttpError(
      409,
      "Decision is not allowed for current hotel status",
    );
  const revision = hotel.revision + 1;
  unit.writes.push(
    updateD1("Hotel", hotel.id, {
      status: v.decision,
      revision,
      reviewReason: v.reason,
      reviewedAt: new Date(),
    }),
  );
  hotelAudit(unit, hotel.id, userId, v.decision, revision, {
    reason: v.reason,
    businessVerified: v.businessVerified,
    previousStatus: hotel.status,
  });
  await unit.commit();
  return { hotelId: hotel.id, status: v.decision, revision };
}
