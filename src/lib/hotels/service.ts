import { Prisma } from "@prisma/client";
import { db, d1Binding } from "../db";
import { mutateHotelD1, reviewHotelD1 } from "./d1-foundation";
import { mailReady } from "../mail";
import { HttpError } from "../http";
import { requireOperator } from "../operator-access";
import { hotelActionSchema, hotelReviewSchema } from "./validation";
export function requireHotels() {
  if (process.env.HOTELS_ENABLED !== "true")
    throw new HttpError(404, "Hotel module is not enabled");
}
async function verifiedUser(
  userId: string,
  tx: Prisma.TransactionClient = db,
  requireVerified = true,
) {
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      disabled: true,
      emailVerified: true,
      agency: { select: { demo: true } },
    },
  });
  if (
    !u ||
    u.disabled ||
    (requireVerified && !u.emailVerified) ||
    u.agency?.demo
  )
    throw new HttpError(
      403,
      "A verified, enabled account is required for hotel access",
    );
  return u;
}
function validateMedia(urls: string[]) {
  const hosts = (process.env.HOTEL_IMAGE_HOSTS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  for (const value of urls) {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443") ||
      u.hash ||
      !hosts.includes(u.hostname.toLowerCase())
    )
      throw new HttpError(
        400,
        "Hotel photos must use an approved HTTPS media host",
      );
  }
}
async function lockHotel(
  tx: Prisma.TransactionClient,
  userId: string,
  hotelId: string,
) {
  await verifiedUser(userId, tx, false);
  // Membership is checked before the lock and again after it; hotelId is never a permission.
  const member = await tx.hotelMember.findUnique({
    where: { hotelId_userId: { hotelId, userId } },
  });
  if (!member) throw new HttpError(404, "Hotel not found");
  await tx.$queryRaw`SELECT id FROM "Hotel" WHERE id=${hotelId} FOR UPDATE`;
  await verifiedUser(userId, tx, false);
  const current = await tx.hotelMember.findUnique({
    where: { hotelId_userId: { hotelId, userId } },
    include: { hotel: { include: { rooms: true } } },
  });
  if (!current) throw new HttpError(404, "Hotel not found");
  if (!["OWNER", "MANAGER"].includes(current.role))
    throw new HttpError(403, "Hotel edit permission required");
  return current;
}
async function audit(
  tx: Prisma.TransactionClient,
  hotelId: string,
  actorId: string,
  action: string,
  revision: number,
  details: Prisma.InputJsonObject = {},
) {
  await tx.hotelAuditEntry.create({
    data: { hotelId, actorId, action, revision, details },
  });
}
export async function hotelOverview(userId: string) {
  requireHotels();
  const user = await verifiedUser(userId, db, false);
  const memberships = await db.hotelMember.findMany({
    where: { userId },
    include: {
      hotel: {
        include: {
          rooms: { orderBy: { name: "asc" } },
          audit: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, action: true, revision: true, createdAt: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return {
    emailVerified: user.emailVerified,
    verificationEmailAvailable: mailReady(),
    hotels: memberships.map(({ hotel, role }) => ({ ...hotel, role })),
    stage:
      d1Binding() && process.env.HOTEL_BOOKING_ENABLED === "true"
        ? "INVENTORY_AND_HOLDS"
        : "FOUNDATION",
    bookingEnabled:
      !!d1Binding() &&
      process.env.HOTEL_BOOKING_ENABLED === "true" &&
      process.env.HOTEL_LIVE_PAYMENTS_APPROVED === "true",
    operationsEnabled:
      !!d1Binding() &&
      process.env.WORKSPACE_OPERATIONS_ENABLED === "true" &&
      process.env.HOTEL_BOOKING_ENABLED === "true",
    inventoryEnabled:
      !!d1Binding() && process.env.HOTEL_BOOKING_ENABLED === "true",
  };
}
export async function mutateHotel(userId: string, input: unknown) {
  requireHotels();
  const v = hotelActionSchema.parse(input);
  if (v.action === "create" || v.action === "profile")
    validateMedia(v.profile.photoUrls);
  if (d1Binding()) return mutateHotelD1(userId, input);
  return db.$transaction(
    async (tx) => {
      await verifiedUser(userId, tx, false);
      if (v.action === "create") {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
        await verifiedUser(userId, tx, false);
        if (
          (await tx.hotelMember.count({ where: { userId, role: "OWNER" } })) >=
          20
        )
          throw new HttpError(409, "Property registration limit reached");
        const hotel = await tx.hotel.create({
          data: {
            ...v.profile,
            members: { create: { userId, role: "OWNER" } },
          },
        });
        await audit(tx, hotel.id, userId, "REGISTERED", 0);
        return { hotelId: hotel.id, revision: 0, status: hotel.status };
      }
      const member = await lockHotel(tx, userId, v.hotelId),
        hotel = member.hotel;
      if (hotel.revision !== v.revision)
        throw new HttpError(409, "Hotel changed. Refresh before saving");
      if (hotel.status === "SUSPENDED")
        throw new HttpError(
          403,
          "Suspended property: contact the platform administrator",
        );
      const revision = hotel.revision + 1;
      if (v.action === "submit") {
        await verifiedUser(userId, tx);
        if (member.role !== "OWNER")
          throw new HttpError(
            403,
            "Only the hotel owner can submit verification",
          );
        if (!["DRAFT", "REJECTED"].includes(hotel.status))
          throw new HttpError(
            409,
            "Only a draft or rejected hotel can be submitted",
          );
        if (
          hotel.address.length < 10 ||
          hotel.city.length < 2 ||
          hotel.region.length < 2 ||
          hotel.policies.length < 20 ||
          hotel.cancellationPolicy.length < 20 ||
          !hotel.rooms.some((r) => r.active)
        )
          throw new HttpError(
            400,
            "Complete address, city, region, policies and an active room category before submission",
          );
        await tx.hotel.update({
          where: { id: hotel.id },
          data: {
            status: "PENDING",
            revision,
            reviewReason: "",
            reviewedAt: null,
          },
        });
        await audit(tx, hotel.id, userId, "SUBMITTED", revision);
        return { hotelId: hotel.id, revision, status: "PENDING" };
      }
      if (v.action === "profile") {
        await tx.hotel.update({
          where: { id: hotel.id },
          data: {
            ...v.profile,
            status: "DRAFT",
            revision,
            reviewReason: "",
            reviewedAt: null,
          },
        });
        await audit(tx, hotel.id, userId, "PROFILE_UPDATED", revision, {
          previousStatus: hotel.status,
        });
      } else {
        if (v.roomId) {
          const changed = await tx.hotelRoomCategory.updateMany({
            where: { id: v.roomId, hotelId: hotel.id },
            data: v.room,
          });
          if (!changed.count)
            throw new HttpError(404, "Room category not found in this hotel");
        } else {
          if (hotel.rooms.length >= 100)
            throw new HttpError(409, "Room category limit reached");
          await tx.hotelRoomCategory.create({
            data: { hotelId: hotel.id, ...v.room },
          });
        }
        await tx.hotel.update({
          where: { id: hotel.id },
          data: {
            status: "DRAFT",
            revision,
            reviewReason: "",
            reviewedAt: null,
          },
        });
        await audit(
          tx,
          hotel.id,
          userId,
          v.roomId ? "ROOM_UPDATED" : "ROOM_CREATED",
          revision,
          { previousStatus: hotel.status },
        );
      }
      return { hotelId: hotel.id, revision, status: "DRAFT" };
    },
    { timeout: 10000 },
  );
}
export async function hotelReviewQueue(userId: string, sessionToken: string) {
  requireHotels();
  await requireOperator(userId, sessionToken);
  return {
    hotels: await db.hotel.findMany({
      include: { rooms: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  };
}
export async function reviewHotel(
  userId: string,
  sessionToken: string,
  input: unknown,
) {
  requireHotels();
  const v = hotelReviewSchema.parse(input);
  if (d1Binding()) return reviewHotelD1(userId, sessionToken, input);
  return db.$transaction(
    async (tx) => {
      // Recheck the privileged session for every decision, not a client-supplied role.
      await requireOperator(userId, sessionToken, tx);
      await tx.$queryRaw`SELECT id FROM "Hotel" WHERE id=${v.hotelId} FOR UPDATE`;
      await requireOperator(userId, sessionToken, tx);
      const h = await tx.hotel.findUnique({ where: { id: v.hotelId } });
      if (!h) throw new HttpError(404, "Hotel not found");
      if (
        await tx.hotelMember.findUnique({
          where: { hotelId_userId: { hotelId: h.id, userId } },
        })
      )
        throw new HttpError(
          403,
          "An operator cannot review a property they belong to",
        );
      if (h.revision !== v.revision)
        throw new HttpError(409, "Hotel changed. Refresh before reviewing");
      if (
        (v.decision === "SUSPENDED" && h.status !== "APPROVED") ||
        (v.decision !== "SUSPENDED" && h.status !== "PENDING")
      )
        throw new HttpError(
          409,
          "Decision is not allowed for the current hotel status",
        );
      if (v.decision === "APPROVED") {
        const owners = await tx.hotelMember.findMany({
          where: { hotelId: h.id, role: "OWNER" },
        });
        if (!owners.length)
          throw new HttpError(403, "A verified hotel owner is required");
        for (const owner of owners) await verifiedUser(owner.userId, tx);
      }
      const revision = h.revision + 1;
      await tx.hotel.update({
        where: { id: h.id },
        data: {
          status: v.decision,
          revision,
          reviewReason: v.reason,
          reviewedAt: new Date(),
        },
      });
      await audit(tx, h.id, userId, v.decision, revision, {
        reason: v.reason,
        previousStatus: h.status,
        businessVerified: v.businessVerified,
      });
      return { hotelId: h.id, status: v.decision, revision };
    },
    { timeout: 10000 },
  );
}
