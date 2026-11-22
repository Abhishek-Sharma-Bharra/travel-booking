import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../http";
import {
  Unit,
  own,
  identity,
  kind,
  id,
  phone,
  now,
  limit,
  update,
  paise,
  date,
  dates,
} from "./core";
import type { Business, Plan, Vehicle, Agreement, Booking } from "./types";
const profile = z
  .object({
    name: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(80),
    address: z.string().trim().min(10).max(500),
    phone,
    email: z.email().max(254),
    registration: z.string().trim().min(3).max(200),
    paymentInstructions: z
      .string()
      .max(300)
      .default(
        "Pay the supplier directly under the agreed booking terms. Do not send payment keys or card details.",
      ),
  })
  .strict();
const vehicle = z
  .object({
    name: z.string().trim().min(2).max(100),
    registration: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .transform((v) => v.toUpperCase()),
    capacity: z.number().int().min(1).max(100),
    pricing: z.enum(["TRIP", "KM"]),
    ratePaise: paise.min(1),
    minKm: z.number().int().min(1).max(10000),
    taxBps: z.number().int().min(0).max(10000),
    policies: z.string().trim().min(20).max(3000),
    photos: z.array(z.url().max(500)).max(10).default([]),
    active: z.boolean().default(true),
  })
  .strict();
export async function registerBusiness(userId: string, input: unknown) {
  const v = z
    .object({ kind, profile, hotelId: id.optional() })
    .strict()
    .parse(input);
  const u = new Unit(),
    user = await identity(u, userId);
  let hotelId: string | null = null,
    agencyId: string | null = null;
  if (v.kind === "HOTEL") {
    if (!v.hotelId)
      throw new HttpError(
        400,
        "Register your hotel in the hotel dashboard first",
      );
    const member = await u.db
      .prepare(
        'SELECT role FROM "HotelMember" WHERE "hotelId"=? AND "userId"=?',
      )
      .bind(v.hotelId, userId)
      .first<{ role: string }>();
    if (member?.role !== "OWNER")
      throw new HttpError(404, "Hotel owner membership required");
    u.guard(
      'SELECT COUNT(*)=1 FROM "HotelMember" WHERE "hotelId"=? AND "userId"=? AND role=\'OWNER\'',
      v.hotelId,
      userId,
    );
    hotelId = v.hotelId;
  }
  if (v.kind === "AGENCY") {
    if (!user.agencyId || user.role !== "OWNER")
      throw new HttpError(403, "Agency owner required");
    agencyId = user.agencyId;
  }
  const count = await u.db
    .prepare("SELECT COUNT(*) n FROM MPBusiness WHERE ownerId=?")
    .bind(userId)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 10)
    throw new HttpError(409, "Business registration limit reached");
  u.guard("SELECT COUNT(*)<10 FROM MPBusiness WHERE ownerId=?", userId);
  const plan = await u.row<Plan>("MPPlan", v.kind);
  const key = randomUUID(),
    p = v.profile;
  u.writes.push(
    {
      sql: "INSERT INTO MPBusiness(id,ownerId,kind,name,city,address,phone,email,registration,paymentInstructions,hotelId,agencyId,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      values: [
        key,
        userId,
        v.kind,
        p.name,
        p.city,
        p.address,
        p.phone,
        p.email,
        p.registration,
        p.paymentInstructions,
        hotelId,
        agencyId,
        now(),
      ],
    },
    {
      sql: "INSERT INTO MPSubscription VALUES(?,'TRIAL',?,?,'Free 14-day trial; no charge',0)",
      values: [
        key,
        plan.monthlyPaise,
        new Date(Date.now() + 14 * 86400000).toISOString(),
      ],
    },
    {
      sql: "INSERT INTO MPAgreement VALUES(?,?,?,?,?,?,?,?,NULL,NULL,0)",
      values: [
        key,
        plan.revision,
        "Commission applies only to eligible Vashisht TravelOS marketplace bookings. Tax and documented refunded net are excluded. No automatic deduction, split or transfer. Payments and settlements are independently verified.",
        plan.commissionBps,
        plan.platformBps,
        plan.agencyBps,
        plan.supplierBps,
        plan.basis,
      ],
    },
  );
  u.audit(userId, key, "REGISTERED");
  u.usage(key);
  await u.commit();
  return { businessId: key, status: "DRAFT" };
}
export async function businessCommand(userId: string, input: unknown) {
  const v = z
    .discriminatedUnion("action", [
      z
        .object({
          action: z.literal("submit"),
          businessId: id,
          revision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          action: z.literal("profile"),
          businessId: id,
          revision: z.number().int().min(0),
          profile,
        })
        .strict(),
      z
        .object({
          action: z.literal("acceptAgreement"),
          businessId: id,
          revision: z.number().int().min(0),
          accepted: z.literal(true),
        })
        .strict(),
      z
        .object({
          action: z.literal("vehicle"),
          businessId: id,
          vehicleId: id.optional(),
          revision: z.number().int().min(0).optional(),
          vehicle,
        })
        .strict(),
      z
        .object({
          action: z.literal("driver"),
          businessId: id,
          name: z.string().trim().min(2).max(100),
          phone,
          licenseReference: z.string().trim().min(3).max(100),
        })
        .strict(),
      z
        .object({
          action: z.literal("blackout"),
          businessId: id,
          vehicleId: id,
          start: date,
          end: date,
          reason: z.string().trim().min(3).max(200),
        })
        .strict(),
      z
        .object({
          action: z.literal("removeBlackout"),
          businessId: id,
          blackoutId: id,
        })
        .strict(),
    ])
    .parse(input);
  const u = new Unit(),
    b = await own(u, userId, v.businessId);
  if (b.status === "SUSPENDED")
    throw new HttpError(403, "Suspended business; contact support");
  if (v.action === "profile") {
    if (v.revision !== b.revision)
      throw new HttpError(409, "Business changed; refresh");
    update(u, "MPBusiness", b.id, {
      ...v.profile,
      status: "DRAFT",
      reviewReason: "",
    });
  } else if (v.action === "submit") {
    await identity(u, userId, true);
    if (v.revision !== b.revision || !["DRAFT", "REJECTED"].includes(b.status))
      throw new HttpError(409, "Only current drafts can be submitted");
    if (b.hotelId) {
      const h = await u.db
        .prepare('SELECT status FROM "Hotel" WHERE id=?')
        .bind(b.hotelId)
        .first<{ status: string }>();
      if (h?.status !== "APPROVED")
        throw new HttpError(409, "Complete existing hotel approval first");
      u.guard(
        "SELECT COUNT(*)=1 FROM \"Hotel\" WHERE id=? AND status='APPROVED'",
        b.hotelId,
      );
    }
    update(u, "MPBusiness", b.id, { status: "PENDING", reviewReason: "" });
  } else if (v.action === "acceptAgreement") {
    await identity(u, userId, true);
    const a = await u.row<Agreement>("MPAgreement", b.id);
    if (a.revision !== v.revision)
      throw new HttpError(409, "Agreement changed; review it again");
    update(u, "MPAgreement", b.id, { acceptedAt: now(), acceptedBy: userId });
  } else if (v.action === "vehicle") {
    if (!["BUS", "CAR"].includes(b.kind))
      throw new HttpError(400, "Vehicles belong to bus/car businesses");
    const p = await limit(u, b);
    for (const url of v.vehicle.photos) {
      const parsed = new URL(url);
      const allowed = (process.env.HOTEL_IMAGE_HOSTS || "")
        .split(",")
        .map((v) => v.trim());
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.hash ||
        (parsed.port && parsed.port !== "443") ||
        !allowed.includes(parsed.hostname)
      )
        throw new HttpError(400, "Use an approved HTTPS photo host");
    }
    const values = {
      ...v.vehicle,
      photos: JSON.stringify(v.vehicle.photos),
      active: v.vehicle.active ? 1 : 0,
    };
    if (v.vehicleId) {
      const old = await u.row<Vehicle>("MPVehicle", v.vehicleId);
      if (old.businessId !== b.id)
        throw new HttpError(404, "Vehicle not found");
      if (v.revision !== old.revision)
        throw new HttpError(409, "Vehicle changed; refresh");
      update(u, "MPVehicle", old.id, values);
    } else {
      const count = await u.db
        .prepare("SELECT COUNT(*) n FROM MPVehicle WHERE businessId=?")
        .bind(b.id)
        .first<{ n: number }>();
      if ((count?.n || 0) >= p.resourceLimit)
        throw new HttpError(409, "Vehicle plan limit reached");
      u.guard(
        "SELECT COUNT(*)<1000 FROM MPVehicle v JOIN MPBusiness b ON b.id=v.businessId WHERE b.ownerId=?",
        userId,
      );
      u.guard(
        "SELECT COUNT(*)<? FROM MPVehicle WHERE businessId=?",
        p.resourceLimit,
        b.id,
      );
      u.writes.push({
        sql: "INSERT INTO MPVehicle(id,businessId,name,registration,capacity,pricing,ratePaise,minKm,taxBps,policies,photos,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        values: [
          randomUUID(),
          b.id,
          values.name,
          values.registration,
          values.capacity,
          values.pricing,
          values.ratePaise,
          values.minKm,
          values.taxBps,
          values.policies,
          values.photos,
          values.active,
        ],
      });
    }
  } else if (v.action === "driver") {
    await limit(u, b);
    const count = await u.db
      .prepare("SELECT COUNT(*) n FROM MPDriver WHERE businessId=?")
      .bind(b.id)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 100)
      throw new HttpError(409, "Driver limit reached");
    u.guard("SELECT COUNT(*)<100 FROM MPDriver WHERE businessId=?", b.id);
    u.writes.push({
      sql: "INSERT INTO MPDriver(id,businessId,name,phone,licenseReference) VALUES(?,?,?,?,?)",
      values: [randomUUID(), b.id, v.name, v.phone, v.licenseReference],
    });
  } else if (v.action === "blackout") {
    dates(v.start, v.end);
    const r = await u.row<Vehicle>("MPVehicle", v.vehicleId);
    if (r.businessId !== b.id) throw new HttpError(404, "Vehicle not found");
    u.guard(
      "SELECT COUNT(*)=0 FROM MPBooking WHERE vehicleId=? AND start<? AND end>? AND (status IN('CONFIRMED','COMPLETED') OR (status='HELD' AND holdUntil>?))",
      r.id,
      v.end,
      v.start,
      now(),
    );
    u.guard("SELECT COUNT(*)<366 FROM MPBlackout WHERE vehicleId=?", r.id);
    u.guard(
      "SELECT COUNT(*)<1000 FROM MPBlackout x JOIN MPBusiness b ON b.id=x.businessId WHERE b.ownerId=?",
      userId,
    );
    u.writes.push({
      sql: "INSERT INTO MPBlackout VALUES(?,?,?,?,?,?)",
      values: [randomUUID(), b.id, r.id, v.start, v.end, v.reason],
    });
  } else {
    u.guard(
      "SELECT COUNT(*)=1 FROM MPBlackout WHERE id=? AND businessId=?",
      v.blackoutId,
      b.id,
    );
    u.writes.push({
      sql: "DELETE FROM MPBlackout WHERE id=? AND businessId=?",
      values: [v.blackoutId, b.id],
    });
  }
  u.audit(userId, b.id, v.action);
  u.usage(b.id);
  await u.commit();
  return { message: "Saved. No payment was processed." };
}
export async function ownDashboard(userId: string) {
  const u = new Unit(),
    user = await identity(u, userId);
  const businesses = (
    await u.db
      .prepare(
        "SELECT * FROM MPBusiness WHERE ownerId=? ORDER BY createdAt DESC LIMIT 10",
      )
      .bind(userId)
      .all<Business>()
  ).results;
  const scoped = await u.db.batch<Record<string, unknown>>([
    u.db
      .prepare(
        "SELECT v.* FROM MPVehicle v JOIN MPBusiness b ON b.id=v.businessId WHERE b.ownerId=? ORDER BY v.name LIMIT 1000",
      )
      .bind(userId),
    u.db
      .prepare(
        "SELECT d.* FROM MPDriver d JOIN MPBusiness b ON b.id=d.businessId WHERE b.ownerId=? LIMIT 1000",
      )
      .bind(userId),
    u.db
      .prepare(
        "SELECT x.* FROM MPBlackout x JOIN MPBusiness b ON b.id=x.businessId WHERE b.ownerId=? AND x.end>=? ORDER BY x.start LIMIT 1000",
      )
      .bind(userId, now().slice(0, 10)),
    u.db
      .prepare(
        "SELECT s.* FROM MPSubscription s JOIN MPBusiness b ON b.id=s.id WHERE b.ownerId=?",
      )
      .bind(userId),
    u.db
      .prepare(
        "SELECT a.* FROM MPAgreement a JOIN MPBusiness b ON b.id=a.id WHERE b.ownerId=?",
      )
      .bind(userId),
    u.db
      .prepare(
        `SELECT r.businessId,COUNT(*) bookings,COALESCE(SUM(CASE WHEN r.status IN('CONFIRMED','COMPLETED') THEN r.total-r.refundedNet-r.refundedTax ELSE 0 END),0) bookedRevenue,COALESCE(SUM(CASE WHEN r.paymentStatus IN('EXTERNALLY_VERIFIED','PROVIDER_VERIFIED') THEN r.total-r.refundedNet-r.refundedTax ELSE 0 END),0) verifiedCollections,COALESCE(SUM(r.expense),0) expenses FROM MPBooking r JOIN MPBusiness b ON b.id=r.businessId WHERE b.ownerId=? GROUP BY r.businessId`,
      )
      .bind(userId),
    u.db
      .prepare(
        `SELECT h.id hotelId,(SELECT COALESCE(SUM(n.allotment),0) FROM HotelRoomNight n WHERE n."hotelId"=h.id AND n.day>=? AND n.day<?) availableRoomNights,(SELECT COALESCE(SUM(n.rooms),0) FROM HotelStayNight n JOIN HotelStayRequest r ON r.id=n."stayId" WHERE n."hotelId"=h.id AND r.status='CONFIRMED' AND n.day>=? AND n.day<?) bookedRoomNights FROM Hotel h JOIN MPBusiness b ON b.hotelId=h.id JOIN HotelMember m ON m."hotelId"=h.id AND m."userId"=b.ownerId AND m.role='OWNER' WHERE b.ownerId=?`,
      )
      .bind(
        new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        now().slice(0, 10),
        new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        now().slice(0, 10),
        userId,
      ),
  ]);
  const details = businesses.map((b) => ({
    ...b,
    vehicles: scoped[0].results.filter((r) => r.businessId === b.id),
    drivers: scoped[1].results.filter((r) => r.businessId === b.id),
    blackouts: scoped[2].results.filter((r) => r.businessId === b.id),
    subscription: scoped[3].results.find((r) => r.id === b.id),
    agreement: scoped[4].results.find((r) => r.id === b.id),
    metrics: scoped[5].results.find((r) => r.businessId === b.id),
    occupancy: scoped[6].results.find((r) => r.hotelId === b.hotelId),
  }));
  const agency =
    user.agencyId && ["OWNER", "MANAGER"].includes(user.role)
      ? user.agencyId
      : null;
  const bookings = (
    await u.db
      .prepare(
        "SELECT b.* FROM MPBooking b JOIN MPBusiness s ON s.id=b.businessId WHERE s.ownerId=? OR (b.requesterId=? AND (b.agencyId IS NULL OR b.agencyId=?)) OR (? IS NOT NULL AND b.agencyId=?) ORDER BY b.createdAt DESC,b.id DESC LIMIT 100",
      )
      .bind(userId, userId, user.agencyId, agency, agency)
      .all<Booking>()
  ).results;
  const ledger = (
    await u.db
      .prepare(
        "SELECT l.* FROM MPCommission l JOIN MPBooking b ON b.id=l.bookingId JOIN MPBusiness s ON s.id=b.businessId WHERE s.ownerId=? OR (? IS NOT NULL AND b.agencyId=?) ORDER BY l.createdAt DESC LIMIT 200",
      )
      .bind(userId, agency, agency)
      .all()
  ).results;
  return {
    businesses: details,
    availableHotels: (
      await u.db
        .prepare(
          'SELECT h.id,h.name,h.status FROM "Hotel" h JOIN "HotelMember" m ON m."hotelId"=h.id WHERE m."userId"=? AND m.role=\'OWNER\' ORDER BY h.name LIMIT 20',
        )
        .bind(userId)
        .all<{ id: string; name: string; status: string }>()
    ).results,
    bookings: bookings.map((b) => ({
      ...b,
      status:
        b.status === "HELD" && b.holdUntil! <= now() ? "EXPIRED" : b.status,
    })),
    ledger,
    plans: (await u.db.prepare("SELECT * FROM MPPlan ORDER BY id").all<Plan>())
      .results,
    emailVerified: user.emailVerified,
    operationsEnabled: process.env.WORKSPACE_OPERATIONS_ENABLED === "true",
    agencyReference: user.agencyId,
    agencyBookingAllowed: !!user.agencyId,
    limitsNote:
      "Latest 100 bookings and 200 commission entries. Date-filtered exports are available.",
    seatTicketingEnabled: false,
    paidServicesEnabled: false,
  };
}
export async function publicSearch(input: {
  kind?: string;
  city?: string;
  start?: string;
  end?: string;
}) {
  const k = input.kind ? kind.parse(input.kind) : null,
    city = z
      .string()
      .max(80)
      .parse(input.city || "");
  if (input.start || input.end) {
    date.parse(input.start);
    date.parse(input.end);
    dates(input.start!, input.end!);
  }
  const u = new Unit();
  const businesses = (
    await u.db
      .prepare(
        "SELECT b.id,b.kind,b.name,b.city,b.hotelId FROM MPBusiness b JOIN MPAgreement a ON a.id=b.id JOIN MPSubscription s ON s.id=b.id WHERE b.status='APPROVED' AND a.acceptedAt IS NOT NULL AND s.status IN('TRIAL','ACTIVE') AND s.expiresAt>? AND (? IS NULL OR b.kind=?) AND instr(lower(b.city),lower(?))>0 AND (b.hotelId IS NULL OR EXISTS(SELECT 1 FROM \"Hotel\" h JOIN \"HotelMember\" m ON m.\"hotelId\"=h.id WHERE m.\"userId\"=b.ownerId AND m.role='OWNER' AND h.id=b.hotelId AND h.status='APPROVED')) ORDER BY b.name,b.id LIMIT 40",
      )
      .bind(now(), k, k, city)
      .all<Pick<Business, "id" | "kind" | "name" | "city" | "hotelId">>()
  ).results;
  const supplierIds = businesses.map((b) => b.id);
  const vehicles = supplierIds.length
    ? (
        await u.db
          .prepare(
            `SELECT id,businessId,name,capacity,pricing,ratePaise,minKm,taxBps,policies,photos FROM MPVehicle v WHERE active=1 AND businessId IN (${supplierIds.map(() => "?").join(",")}) AND (? IS NULL OR (NOT EXISTS(SELECT 1 FROM MPBlackout x WHERE x.vehicleId=v.id AND x.start<? AND x.end>?) AND NOT EXISTS(SELECT 1 FROM MPBooking r WHERE r.vehicleId=v.id AND r.start<? AND r.end>? AND (r.status IN('CONFIRMED','COMPLETED') OR (r.status='HELD' AND r.holdUntil>?))))) ORDER BY name LIMIT 100`,
          )
          .bind(
            ...supplierIds,
            input.start || null,
            input.end || "",
            input.start || "",
            input.end || "",
            input.start || "",
            now(),
          )
          .all()
      ).results
    : [];
  return {
    businesses,
    vehicles,
    plans: (await u.db.prepare("SELECT * FROM MPPlan ORDER BY id").all<Plan>())
      .results,
    seatTicketingEnabled: false,
  };
}
