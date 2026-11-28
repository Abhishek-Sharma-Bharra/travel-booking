import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../access";
import { db, d1Binding } from "../db";
import { HttpError } from "../http";
import { guardedD1Batch, type D1Statement } from "../d1/atomic";
import { requireSubscription } from "../subscriptions";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function commerceDb() {
  const b = d1Binding();
  if (!b)
    throw new HttpError(503, "Commerce requires the native D1 deployment");
  return b;
}
export async function manager(a: Actor, write = true) {
  const u = await db.user.findUnique({
    where: { id: a.id },
    include: { agency: true },
  });
  if (
    !u ||
    u.disabled ||
    u.agencyId !== a.agencyId ||
    !["OWNER", "MANAGER"].includes(u.role) ||
    u.agency?.demo
  )
    throw new HttpError(
      403,
      "An enabled non-demo owner or manager is required",
    );
  if (write) requireSubscription(u.agency!);
  return u;
}
export const managerGuard = (a: Actor, write = true): D1Statement => ({
  sql:
    `SELECT COUNT(*)=1 FROM User u JOIN Agency a ON a.id=u.agencyId WHERE u.id=? AND u.agencyId=? AND u.disabled=0 AND u.role IN ('OWNER','MANAGER') AND a.demo=0` +
    (write
      ? ` AND ((a.subscription='Active' AND (a.subscriptionExpiresAt IS NULL OR a.subscriptionExpiresAt>?)) OR (a.subscription='Trial' AND a.trialEndsAt>?))`
      : ""),
  values: [
    a.id,
    a.agencyId,
    ...(write ? [new Date().toISOString(), new Date().toISOString()] : []),
  ],
});
const state = z.string().regex(/^(0[1-9]|[12][0-9]|3[0-8])$/);
export function validGstin(s: string) {
  if (!/^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s))
    return false;
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let factor = 2,
    sum = 0;
  for (let i = 13; i >= 0; i--) {
    const n = alphabet.indexOf(s[i]) * factor;
    sum += Math.floor(n / 36) + (n % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return alphabet[(36 - (sum % 36)) % 36] === s[14];
}
const party = z
  .object({
    name: z.string().trim().min(2).max(160),
    address: z.string().trim().min(8).max(500),
    stateCode: state,
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => !v || validGstin(v), "Invalid GSTIN checksum"),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.gstin && !v.gstin.startsWith(v.stateCode))
      c.addIssue({ code: "custom", message: "GSTIN and state must match" });
  });
const line = z
  .object({
    description: z.string().trim().min(3).max(240),
    sac: z.string().regex(/^\d{6}$/),
    taxablePaise: z.number().int().min(1).max(2000000000),
    gstBps: z.union([
      z.literal(0),
      z.literal(500),
      z.literal(1200),
      z.literal(1800),
      z.literal(2800),
    ]),
  })
  .strict();
export const documentSchema = z
  .object({
    requestId: z.string().uuid(),
    bookingId: z.string().min(1).max(100),
    kind: z.enum(["INVOICE", "CREDIT_NOTE"]),
    originalId: z.string().max(100).optional(),
    supplier: party,
    recipient: party,
    placeOfSupply: state,
    lines: z.array(line).min(1).max(30),
    reason: z.string().trim().min(5).max(500),
    taxBasis: z.string().trim().min(10).max(700),
    reviewed: z.literal(true),
  })
  .strict();
export function calculateDocument(input: unknown) {
  const v = documentSchema.parse(input);
  if (!v.supplier.gstin)
    throw new HttpError(
      400,
      "A valid registered supplier GSTIN is required for a GST tax invoice",
    );
  if (
    (v.kind === "CREDIT_NOTE" && !v.originalId) ||
    (v.kind === "INVOICE" && v.originalId)
  )
    throw new HttpError(400, "Review the original invoice reference");
  const intra = v.supplier.stateCode === v.placeOfSupply;
  let taxable = 0,
    cgst = 0,
    sgst = 0,
    igst = 0;
  const lines = v.lines.map((l) => {
    const tax = Number(
      (BigInt(l.taxablePaise) * BigInt(l.gstBps) + 5000n) / 10000n,
    );
    const c = intra ? Math.floor(tax / 2) : 0,
      s = intra ? tax - c : 0,
      i = intra ? 0 : tax;
    taxable += l.taxablePaise;
    cgst += c;
    sgst += s;
    igst += i;
    return { ...l, cgst: c, sgst: s, igst: i, total: l.taxablePaise + tax };
  });
  const total = taxable + cgst + sgst + igst;
  if (!Number.isSafeInteger(total) || total > 2000000000)
    throw new HttpError(400, "Document exceeds the supported INR limit");
  return {
    ...v,
    lines,
    taxable,
    cgst,
    sgst,
    igst,
    total,
    currency: "INR" as const,
  };
}
export type CommerceDocument = {
  id: string;
  agencyId: string;
  bookingId: string;
  kind: string;
  originalId: string | null;
  number: string;
  financialYear: string;
  payloadHash: string;
  snapshot: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  createdAt: string;
};
export function indiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function financialYear(date: string) {
  const y = Number(date.slice(0, 4)),
    m = Number(date.slice(5, 7)),
    start = m >= 4 ? y : y - 1;
  return String(start).slice(-2) + String(start + 1).slice(-2);
}
export async function issueDocument(a: Actor, input: unknown) {
  await manager(a);
  const b = commerceDb(),
    v = calculateDocument(input),
    payloadHash = hash(JSON.stringify(v));
  const old = await b
    .prepare("SELECT * FROM CommerceDocument WHERE agencyId=? AND requestId=?")
    .bind(a.agencyId, v.requestId)
    .first<CommerceDocument>();
  if (old) {
    if (old.payloadHash !== payloadHash)
      throw new HttpError(
        409,
        "Request ID was reused with different invoice details",
      );
    return old;
  }
  const booking = await db.booking.findFirst({
    where: { id: v.bookingId, agencyId: a.agencyId },
    include: { lead: true },
  });
  if (!booking) throw new HttpError(404, "Booking not found");
  const original = v.originalId
    ? await b
        .prepare(
          "SELECT * FROM CommerceDocument WHERE id=? AND agencyId=? AND bookingId=? AND kind='INVOICE'",
        )
        .bind(v.originalId, a.agencyId, v.bookingId)
        .first<CommerceDocument>()
    : null;
  if (v.kind === "CREDIT_NOTE") {
    if (!original) throw new HttpError(404, "Original invoice not found");
    const o = JSON.parse(original.snapshot);
    if (
      JSON.stringify(o.supplier) !== JSON.stringify(v.supplier) ||
      JSON.stringify(o.recipient) !== JSON.stringify(v.recipient) ||
      o.placeOfSupply !== v.placeOfSupply
    )
      throw new HttpError(
        400,
        "Credit note parties and supply location must match the original invoice",
      );
  }
  const date = indiaDate(),
    fy = financialYear(date),
    id = randomUUID(),
    createdAt = new Date().toISOString(),
    snapshot = JSON.stringify({
      ...v,
      originalNumber: original?.number,
      issueDate: date,
      customer: booking.lead.customer,
      bookingReference: booking.id,
    });
  const limits: D1Statement[] =
    v.kind === "INVOICE"
      ? [
          {
            sql: `SELECT status!='Cancelled' AND total>=?+(SELECT COALESCE(SUM(CASE WHEN kind='INVOICE' THEN total ELSE -total END),0) FROM CommerceDocument WHERE agencyId=? AND bookingId=?) FROM Booking WHERE id=? AND agencyId=?`,
            values: [v.total, a.agencyId, v.bookingId, v.bookingId, a.agencyId],
          },
        ]
      : [
          {
            sql: `SELECT total>=?+(SELECT COALESCE(SUM(total),0) FROM CommerceDocument WHERE originalId=? AND agencyId=?) AND taxable>=?+(SELECT COALESCE(SUM(taxable),0) FROM CommerceDocument WHERE originalId=? AND agencyId=?) AND cgst>=?+(SELECT COALESCE(SUM(cgst),0) FROM CommerceDocument WHERE originalId=? AND agencyId=?) AND sgst>=?+(SELECT COALESCE(SUM(sgst),0) FROM CommerceDocument WHERE originalId=? AND agencyId=?) AND igst>=?+(SELECT COALESCE(SUM(igst),0) FROM CommerceDocument WHERE originalId=? AND agencyId=?) FROM CommerceDocument WHERE id=? AND agencyId=?`,
            values: [
              v.total,
              v.originalId!,
              a.agencyId,
              v.taxable,
              v.originalId!,
              a.agencyId,
              v.cgst,
              v.originalId!,
              a.agencyId,
              v.sgst,
              v.originalId!,
              a.agencyId,
              v.igst,
              v.originalId!,
              a.agencyId,
              v.originalId!,
              a.agencyId,
            ],
          },
        ];
  await guardedD1Batch(
    b,
    [managerGuard(a), ...limits],
    [
      {
        sql: `INSERT INTO CommerceSequence(agencyId,financialYear,kind,value) VALUES(?,?,?,1) ON CONFLICT(agencyId,financialYear,kind) DO UPDATE SET value=value+1`,
        values: [a.agencyId, fy, v.kind],
      },
      {
        sql: `INSERT INTO CommerceDocument(id,agencyId,bookingId,kind,originalId,number,financialYear,requestId,payloadHash,snapshot,taxable,cgst,sgst,igst,total,actorId,createdAt) SELECT ?,?,?,?,?,? || '/' || ? || '/' || printf('%06d',value),?,?,?,?,?,?,?,?,?,?,? FROM CommerceSequence WHERE agencyId=? AND financialYear=? AND kind=?`,
        values: [
          id,
          a.agencyId,
          v.bookingId,
          v.kind,
          v.originalId || null,
          v.kind === "INVOICE" ? "I" : "C",
          fy,
          fy,
          v.requestId,
          payloadHash,
          snapshot,
          v.taxable,
          v.cgst,
          v.sgst,
          v.igst,
          v.total,
          a.id,
          createdAt,
          a.agencyId,
          fy,
          v.kind,
        ],
      },
      {
        sql: `INSERT INTO Activity(id,agencyId,leadId,actor,action,createdAt) VALUES(?,?,?,?,?,?)`,
        values: [
          randomUUID(),
          a.agencyId,
          booking.leadId,
          a.id,
          `Issued immutable ${v.kind} ${id}`,
          createdAt,
        ],
      },
    ],
  );
  return (await b
    .prepare("SELECT * FROM CommerceDocument WHERE id=? AND agencyId=?")
    .bind(id, a.agencyId)
    .first<CommerceDocument>())!;
}
export async function commerceOverview(a: Actor) {
  await manager(a, false);
  return {
    payments: (
      await commerceDb()
        .prepare(
          "SELECT id,bookingId,providerOrderId,providerPaymentId,amount,mode,state,createdAt FROM CommercePaymentOrder WHERE agencyId=? ORDER BY createdAt DESC LIMIT 50",
        )
        .bind(a.agencyId)
        .all()
    ).results,
    bookings: await db.booking.findMany({
      where: { agencyId: a.agencyId },
      select: {
        id: true,
        total: true,
        status: true,
        lead: { select: { customer: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    documents: (
      await commerceDb()
        .prepare(
          "SELECT * FROM CommerceDocument WHERE agencyId=? ORDER BY createdAt DESC LIMIT 100",
        )
        .bind(a.agencyId)
        .all<CommerceDocument>()
    ).results,
  };
}
