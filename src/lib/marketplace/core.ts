import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { User, Agency } from "@prisma/client";
import { d1Binding } from "../db";
import { D1Unit } from "../d1/unit";
import { HttpError } from "../http";
import type { D1Value } from "../d1/atomic";
import type { Business, Booking, Snapshot } from "./types";
export const now = () => new Date().toISOString();
export const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w-]+$/);
export const paise = z.number().int().min(0).max(100000000);
export const kind = z.enum(["AGENCY", "HOTEL", "BUS", "CAR"]);
export const date = z.iso.date();
export const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
export function dates(start: string, end: string) {
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 30 ||
    start < now().slice(0, 10) ||
    start > new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
  )
    throw new HttpError(400, "Choose 1–30 days within the next year");
  return days;
}
export function database() {
  const db = d1Binding();
  if (!db)
    throw new HttpError(
      503,
      "Marketplace requires the configured Cloudflare D1 runtime",
    );
  return db;
}
const tables = new Set([
  "MPBusiness",
  "MPPlan",
  "MPSubscription",
  "MPAgreement",
  "MPVehicle",
  "MPDriver",
  "MPBooking",
]);
export class Unit extends D1Unit {
  private seenGuards = new Set<string>();
  guard(sql: string, ...values: D1Value[]) {
    const key = JSON.stringify([sql, values]);
    if (!this.seenGuards.has(key)) {
      this.seenGuards.add(key);
      super.guard(sql, ...values);
    }
  }
  constructor() {
    super(database());
  }
  async row<T>(table: string, key: string) {
    if (!tables.has(table)) throw Error("Invalid internal table");
    const row = await this.db
      .prepare(`SELECT * FROM ${table} WHERE id=?`)
      .bind(key)
      .first<T & { revision: number }>();
    if (!row) throw new HttpError(404, "Record not found");
    this.guard(
      `SELECT COUNT(*)=1 FROM ${table} WHERE id=? AND revision=?`,
      key,
      row.revision,
    );
    return row;
  }
  audit(
    userId: string,
    businessId: string | null,
    action: string,
    details: unknown = {},
  ) {
    this.writes.push({
      sql: "INSERT INTO MPAudit VALUES (?,?,?,?,?,?)",
      values: [
        randomUUID(),
        businessId,
        userId,
        action,
        JSON.stringify(details),
        now(),
      ],
    });
  }
  usage(businessId: string, request = false) {
    this.writes.push({
      sql: "INSERT INTO MPUsage(businessId,day,operations,requests) VALUES(?,?,1,?) ON CONFLICT(businessId,day) DO UPDATE SET operations=operations+1,requests=requests+excluded.requests",
      values: [businessId, now().slice(0, 10), request ? 1 : 0],
    });
  }
}
export async function identity(u: Unit, userId: string, verified = false) {
  const user = (await u.read<User>("User", '"id"=?', [userId]))[0];
  if (!user || user.disabled || (verified && !user.emailVerified))
    throw new HttpError(
      403,
      verified
        ? "Verify your email before using marketplace bookings"
        : "Enabled account required",
    );
  if (user.agencyId) {
    const a = (await u.read<Agency>("Agency", '"id"=?', [user.agencyId]))[0];
    if (a?.demo) throw new HttpError(403, "Demo marketplace is read-only");
  }
  return user;
}
export async function own(u: Unit, userId: string, businessId: string) {
  await identity(u, userId);
  const b = await u.row<Business>("MPBusiness", businessId);
  if (b.ownerId !== userId) throw new HttpError(404, "Business not found");
  await businessLink(u, b);
  return b;
}
export async function businessLink(u: Unit, b: Business) {
  if (b.hotelId) {
    const sql =
      'SELECT COUNT(*)=1 AS ok FROM "HotelMember" WHERE "hotelId"=? AND "userId"=? AND role=\'OWNER\'';
    if (
      !(
        await u.db
          .prepare(sql)
          .bind(b.hotelId, b.ownerId)
          .first<{ ok: number }>()
      )?.ok
    )
      throw new HttpError(403, "Current hotel owner membership required");
    u.guard(sql, b.hotelId, b.ownerId);
  }
  if (b.agencyId) {
    const sql =
      'SELECT COUNT(*)=1 AS ok FROM "User" WHERE id=? AND "agencyId"=? AND role=\'OWNER\' AND disabled=0';
    if (
      !(
        await u.db
          .prepare(sql)
          .bind(b.ownerId, b.agencyId)
          .first<{ ok: number }>()
      )?.ok
    )
      throw new HttpError(403, "Current agency owner permission required");
    u.guard(sql, b.ownerId, b.agencyId);
  }
}
export function update(
  u: Unit,
  table: string,
  key: string,
  fields: Record<string, D1Value>,
) {
  if (!tables.has(table)) throw Error("Invalid internal table");
  const entries = Object.entries(fields);
  if (entries.some(([key]) => !/^[a-zA-Z]+$/.test(key)))
    throw Error("Invalid internal field");
  u.writes.push({
    sql: `UPDATE ${table} SET ${entries.length ? entries.map(([key]) => `${key}=?`).join(",") + "," : ""}revision=revision+1 WHERE id=?`,
    values: [...entries.map(([, v]) => v), key],
  });
}
export function effective(b: Booking) {
  return b.status === "HELD" && (!b.holdUntil || b.holdUntil <= now())
    ? "EXPIRED"
    : b.status;
}
export function rounded(amount: number, bps: number) {
  return Number((BigInt(amount) * BigInt(bps) + 5000n) / 10000n);
}
export function commission(
  b: Pick<Booking, "subtotal" | "discount" | "refundedNet" | "origin">,
  s: Snapshot,
) {
  const paidNet = b.subtotal - b.discount;
  const net =
    b.refundedNet >= paidNet
      ? 0
      : Math.max(
          0,
          b.subtotal -
            (s.agreement.basis === "NET_AFTER_DISCOUNT" ? b.discount : 0) -
            b.refundedNet,
        );
  const fee =
    s.eligible && b.origin === "MARKETPLACE"
      ? rounded(net, s.agreement.commissionBps)
      : 0;
  const agency = s.hasAgency ? rounded(fee, s.agreement.agencyBps) : 0;
  const supplier = Math.min(
    fee - agency,
    rounded(fee, s.agreement.supplierBps),
  );
  return {
    eligibleNet: s.eligible ? net : 0,
    commission: fee,
    platform: fee - agency - supplier,
    agency,
    supplier,
  };
}
export function ledger(
  u: Unit,
  b: Booking,
  key: string,
  type: "EARNED" | "REFUND_ADJUSTMENT",
  amounts: ReturnType<typeof commission>,
) {
  u.writes.push({
    sql: "INSERT INTO MPCommission VALUES (?,?,?,?,?,?,?,?,?,?)",
    values: [
      randomUUID(),
      b.id,
      key,
      type,
      amounts.eligibleNet,
      amounts.commission,
      amounts.platform,
      amounts.agency,
      amounts.supplier,
      now(),
    ],
  });
}
export async function limit(u: Unit, business: Business, request = false) {
  const p = await u.row<import("./types").Plan>("MPPlan", business.kind);
  const s = await u.row<import("./types").Subscription>(
    "MPSubscription",
    business.id,
  );
  if (!["TRIAL", "ACTIVE"].includes(s.status) || s.expiresAt <= now())
    throw new HttpError(
      403,
      "Business subscription is inactive; existing records remain readable",
    );
  if (request) {
    const month = now().slice(0, 7);
    const count = await u.db
      .prepare(
        "SELECT COALESCE(SUM(requests),0) AS n FROM MPUsage WHERE businessId=? AND day>=?",
      )
      .bind(business.id, month + "-01")
      .first<{ n: number }>();
    if ((count?.n || 0) >= p.requestLimit)
      throw new HttpError(429, "Monthly booking-request limit reached");
    u.guard(
      "SELECT COALESCE(SUM(requests),0)<? FROM MPUsage WHERE businessId=? AND day>=?",
      p.requestLimit,
      business.id,
      month + "-01",
    );
  }
  return p;
}
