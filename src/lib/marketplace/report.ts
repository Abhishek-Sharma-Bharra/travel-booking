import { z } from "zod";
import { Unit, identity, now, id } from "./core";
import { adminUnit } from "./admin";
import { HttpError } from "../http";
export async function report(
  userId: string,
  query: URLSearchParams,
  token?: string,
) {
  const v = z
    .object({
      kind: z
        .enum(["BOOKINGS", "COMMISSION", "SETTLEMENT"])
        .default("BOOKINGS"),
      from: z.iso.date(),
      to: z.iso.date(),
      cursor: id.optional(),
    })
    .parse(Object.fromEntries(query));
  if (v.from >= v.to || (Date.parse(v.to) - Date.parse(v.from)) / 86400000 > 93)
    throw new HttpError(
      400,
      "Choose a report period of up to 93 days (end date exclusive)",
    );
  const u = token ? await adminUnit(userId, token) : new Unit();
  const actor = await identity(u, userId);
  const agency =
    actor.agencyId && ["OWNER", "MANAGER"].includes(actor.role)
      ? actor.agencyId
      : null;
  const admin = !!token;
  const table =
    v.kind === "BOOKINGS"
      ? "MPBooking"
      : v.kind === "COMMISSION"
        ? "MPCommission"
        : "MPSettlement";
  const columns =
    v.kind === "BOOKINGS"
      ? "r.id,r.businessId,r.origin,r.start,r.end,r.status,r.paymentStatus,r.subtotal,r.tax,r.total,r.refundedNet,r.refundedTax,r.expense,r.createdAt"
      : v.kind === "COMMISSION"
        ? "r.id,r.bookingId,r.kind,r.eligibleNet,r.commission,r.platform,r.agency,r.supplier,r.createdAt"
        : "r.id,r.bookingId,r.party,r.direction,r.amount,r.reference,r.createdAt";
  const joins =
    v.kind === "BOOKINGS"
      ? "JOIN MPBusiness s ON s.id=r.businessId"
      : "JOIN MPBooking b ON b.id=r.bookingId JOIN MPBusiness s ON s.id=b.businessId";
  const bookingAlias = v.kind === "BOOKINGS" ? "r" : "b";
  const permission = admin
    ? "1=1"
    : `(s.ownerId=? OR (${bookingAlias}.agencyId=? AND ? IS NOT NULL) ${v.kind === "BOOKINGS" ? `OR (${bookingAlias}.requesterId=? AND (${bookingAlias}.agencyId IS NULL OR ${bookingAlias}.agencyId=?))` : ""})`;
  const values = [
    v.from + "T00:00:00.000Z",
    v.to + "T00:00:00.000Z",
    v.cursor || "",
    ...(admin
      ? []
      : [
          userId,
          agency,
          agency,
          ...(v.kind === "BOOKINGS" ? [userId, actor.agencyId] : []),
        ]),
  ];
  const rows = (
    await u.db
      .prepare(
        `SELECT ${columns} FROM ${table} r ${joins} WHERE r.createdAt>=? AND r.createdAt<? AND r.id>? AND ${permission} ORDER BY r.id LIMIT 500`,
      )
      .bind(...values)
      .all<Record<string, unknown>>()
  ).results;
  const keys = rows.length ? Object.keys(rows[0]) : ["id"];
  const cell = (value: unknown) => {
    let str = String(value ?? "");
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  };
  return {
    csv: [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n"),
    cursor: rows.length === 500 ? String(rows.at(-1)!.id) : "",
    filename: `travelos-${v.kind.toLowerCase()}-${v.from}.csv`,
    generatedAt: now(),
  };
}
