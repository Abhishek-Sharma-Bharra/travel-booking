import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../access";
import { db } from "../db";
import { HttpError, trustedOrigin } from "../http";
import { sendMail } from "../mail";
import { guardedD1Batch } from "../d1/atomic";
import {
  commerceDb,
  hash,
  manager,
  managerGuard,
  type CommerceDocument,
} from "./documents";
import { balances } from "../money";
export const portalCookie = "travelos_customer";
export async function inviteCustomer(
  a: Actor,
  input: unknown,
  deliver = sendMail,
) {
  await manager(a);
  const v = z
      .object({ bookingId: z.string().min(1).max(100) })
      .strict()
      .parse(input),
    b = commerceDb();
  const booking = await db.booking.findFirst({
    where: { id: v.bookingId, agencyId: a.agencyId },
    include: { lead: true, agency: true },
  });
  if (!booking) throw new HttpError(404, "Booking not found");
  const email = z.email().parse(booking.lead.email.trim().toLowerCase()),
    token = randomBytes(32).toString("base64url"),
    id = randomUUID(),
    now = new Date().toISOString();
  // Only the current maintained booking email can receive an invitation. No arbitrary recipients.
  await guardedD1Batch(
    b,
    [
      managerGuard(a),
      {
        sql: `SELECT COUNT(*)=1 FROM Lead WHERE id=? AND agencyId=? AND lower(trim(email))=?`,
        values: [booking.leadId, a.agencyId, email],
      },
    ],
    [
      {
        sql: `INSERT INTO CustomerInvitation(id,agencyId,bookingId,tokenHash,email,actorId,createdAt,expiresAt) VALUES(?,?,?,?,?,?,?,?)`,
        values: [
          id,
          a.agencyId,
          booking.id,
          hash(token),
          email,
          a.id,
          now,
          new Date(Date.now() + 86400000).toISOString(),
        ],
      },
    ],
  );
  try {
    await deliver(
      email,
      `${booking.agency.name}: your private booking portal`,
      `Your booking portal invitation expires in 24 hours. Open the link and choose Continue. Do not share this link.\n${trustedOrigin()}/customer#invite=${token}\nIf you did not request this, contact your agency. This message does not confirm payment or inventory.`,
    );
  } catch (e) {
    await b
      .prepare("UPDATE CustomerInvitation SET revokedAt=? WHERE id=?")
      .bind(new Date().toISOString(), id)
      .run();
    throw e;
  }
  return { sent: true, expiresInHours: 24 };
}
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export async function consumeInvitation(raw: unknown) {
  const token = tokenSchema.parse(raw),
    b = commerceDb(),
    now = new Date().toISOString();
  const grant = await b
    .prepare(
      `SELECT i.id FROM CustomerInvitation i JOIN Booking bk ON bk.id=i.bookingId AND bk.agencyId=i.agencyId JOIN Lead l ON l.id=bk.leadId AND l.agencyId=bk.agencyId WHERE i.tokenHash=? AND i.consumedAt IS NULL AND i.revokedAt IS NULL AND i.expiresAt>? AND lower(trim(l.email))=i.email`,
    )
    .bind(hash(token), now)
    .first<{ id: string }>();
  if (!grant)
    throw new HttpError(
      401,
      "Invitation expired, already used or unavailable. Request a new link from your agency.",
    );
  const session = randomBytes(32).toString("base64url");
  await guardedD1Batch(
    b,
    [
      {
        sql: `SELECT COUNT(*)=1 FROM CustomerInvitation i JOIN Booking bk ON bk.id=i.bookingId AND bk.agencyId=i.agencyId JOIN Lead l ON l.id=bk.leadId AND l.agencyId=bk.agencyId WHERE i.id=? AND i.consumedAt IS NULL AND i.revokedAt IS NULL AND i.expiresAt>? AND lower(trim(l.email))=i.email`,
        values: [grant.id, now],
      },
    ],
    [
      {
        sql: "UPDATE CustomerInvitation SET consumedAt=? WHERE id=?",
        values: [now, grant.id],
      },
      {
        sql: "INSERT INTO CustomerPortalSession(tokenHash,invitationId,createdAt,expiresAt) VALUES(?,?,?,?)",
        values: [
          hash(session),
          grant.id,
          now,
          new Date(Date.now() + 86400000).toISOString(),
        ],
      },
    ],
  );
  return session;
}
export async function portalGrant(raw: unknown) {
  const token = tokenSchema.safeParse(raw);
  if (!token.success)
    throw new HttpError(401, "Use the private invitation sent by your agency");
  const g = await commerceDb()
    .prepare(
      `SELECT i.id,i.agencyId,i.bookingId FROM CustomerPortalSession s JOIN CustomerInvitation i ON i.id=s.invitationId JOIN Booking bk ON bk.id=i.bookingId AND bk.agencyId=i.agencyId JOIN Lead l ON l.id=bk.leadId AND l.agencyId=bk.agencyId WHERE s.tokenHash=? AND s.expiresAt>? AND i.revokedAt IS NULL AND lower(trim(l.email))=i.email`,
    )
    .bind(hash(token.data), new Date().toISOString())
    .first<{ id: string; agencyId: string; bookingId: string }>();
  if (!g)
    throw new HttpError(
      401,
      "Portal session expired or revoked. Request a fresh invitation.",
    );
  return g;
}
export async function customerOverview(token: unknown) {
  const g = await portalGrant(token),
    booking = await db.booking.findFirst({
      where: { id: g.bookingId, agencyId: g.agencyId },
      include: { lead: true, agency: true, quote: true, transactions: true },
    });
  if (!booking) throw new HttpError(404, "Booking unavailable");
  const b = balances(booking);
  const documents = (
    await commerceDb()
      .prepare(
        "SELECT * FROM CommerceDocument WHERE agencyId=? AND bookingId=? ORDER BY createdAt DESC LIMIT 100",
      )
      .bind(g.agencyId, g.bookingId)
      .all<CommerceDocument>()
  ).results;
  // Deliberate projection: no supplier costs, lead notes, staff identities, API tokens or other customers.
  let paymentMode: string | null = null;
  try {
    paymentMode = (await import("./payments")).merchant(g.agencyId).mode;
  } catch {}
  return {
    paymentMode,
    agency: { name: booking.agency.name },
    booking: {
      id: booking.id,
      customer: booking.lead.customer,
      destination: booking.lead.destination,
      status: booking.status,
      travelStart: booking.travelStart,
      travelEnd: booking.travelEnd,
      packageName: booking.quote.packageName,
      itinerary: booking.quote.proposal,
      paymentTerms: booking.quote.paymentTerms,
      cancellationTerms: booking.quote.cancellationTerms,
      total: booking.total,
      recordedReceipts: b.receipts,
      recordedRefunds: b.refunds,
      outstanding: b.customerDue,
    },
    documents: documents.map(
      ({ id, number, kind, snapshot, total, createdAt }) => ({
        id,
        number,
        kind,
        snapshot,
        total,
        createdAt,
      }),
    ),
  };
}
export async function revokeCustomerAccess(a: Actor, bookingId: string) {
  await manager(a, false);
  await guardedD1Batch(
    commerceDb(),
    [managerGuard(a, false)],
    [
      {
        sql: "UPDATE CustomerInvitation SET revokedAt=? WHERE agencyId=? AND bookingId=? AND revokedAt IS NULL",
        values: [new Date().toISOString(), a.agencyId, bookingId],
      },
    ],
  );
  return { revoked: true };
}
export async function logoutCustomer(token: string) {
  await commerceDb()
    .prepare("DELETE FROM CustomerPortalSession WHERE tokenHash=?")
    .bind(hash(token))
    .run();
}
