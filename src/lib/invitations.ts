import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { Actor, requireOwner } from "./access";
import { ensureSeat, requireSubscription } from "./subscriptions";
import { requireMail, sendMail, verificationRequired } from "./mail";
import { HttpError, trustedOrigin } from "./http";
export const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function inviteMember(a: Actor, input: unknown) {
  requireOwner(a);
  requireMail();
  const v = z
    .object({
      email: z.email().transform((s) => s.toLowerCase()),
      role: z.enum(["MANAGER", "AGENT"]),
    })
    .parse(input);
  const agency = await db.agency.findUniqueOrThrow({
    where: { id: a.agencyId },
  });
  requireSubscription(agency);
  const existing = await db.user.findUnique({ where: { email: v.email } });
  if (existing?.agencyId === a.agencyId)
    throw new HttpError(
      409,
      "This person already belongs to your agency. Manage their access instead.",
    );
  const token = randomBytes(32).toString("base64url");
  const invitation = await db.$transaction(
    async (tx) => {
      await ensureSeat(tx, agency);
      if (
        await tx.invitation.findFirst({
          where: {
            agencyId: a.agencyId,
            email: v.email,
            status: "Pending",
            expiresAt: { gt: new Date() },
          },
        })
      )
        throw new HttpError(
          409,
          "An invitation is already pending. Revoke it before sending a replacement.",
        );
      return tx.invitation.create({
        data: {
          agencyId: a.agencyId,
          email: v.email,
          role: v.role,
          tokenHash: tokenDigest(token),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  try {
    await sendMail(
      v.email,
      `Invitation to ${agency.name}`,
      `You have been invited as ${v.role.toLowerCase()} to ${agency.name} on Vashisht TravelOS.\n\nSign in or create an account using this email, then open this one-time link:\n${trustedOrigin()}/join?token=${token}\n\nIt expires in 7 days. Ignore it if unexpected. Do not share this link.`,
    );
  } catch {
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: "Revoked" },
    });
    throw new HttpError(
      503,
      "Invitation email could not be delivered. No active invitation was left. Check email configuration and retry.",
    );
  }
  await db.activity.create({
    data: {
      agencyId: a.agencyId,
      actor: a.id,
      action: `Team invitation sent: ${v.email}, ${v.role}`,
    },
  });
  return {
    message:
      "Invitation emailed. The recipient chooses their own password; you never need to share one.",
  };
}
export async function revokeInvitation(a: Actor, input: unknown) {
  requireOwner(a);
  const { id } = z.object({ id: z.string() }).parse(input);
  const changed = await db.invitation.updateMany({
    where: { id, agencyId: a.agencyId, status: "Pending" },
    data: { status: "Revoked" },
  });
  if (!changed.count) throw new HttpError(404, "Pending invitation not found");
  await db.activity.create({
    data: {
      agencyId: a.agencyId,
      actor: a.id,
      action: "Pending invitation revoked",
    },
  });
  return { message: "Invitation revoked" };
}
export async function acceptInvitation(userId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(400, "Invitation is invalid or expired");
  return db.$transaction(
    async (tx) => {
      const invitation = await tx.invitation.findUnique({
          where: { tokenHash: tokenDigest(token) },
        }),
        user = await tx.user.findUnique({ where: { id: userId } });
      if (
        !invitation ||
        !user ||
        user.disabled ||
        user.email.toLowerCase() !== invitation.email ||
        invitation.status !== "Pending" ||
        +invitation.expiresAt <= Date.now()
      )
        throw new HttpError(
          403,
          "Invitation is invalid, expired or does not match your signed-in email",
        );
      if (verificationRequired() && !user.emailVerified)
        throw new HttpError(
          403,
          "Verify your email before accepting the invitation",
        );
      const target = await tx.agency.findUniqueOrThrow({
        where: { id: invitation.agencyId },
      });
      requireSubscription(target);
      if (target.demo)
        throw new HttpError(403, "Demo membership cannot be changed");
      await ensureSeat(tx, target, 0);
      if (user.agencyId && user.agencyId !== target.id) {
        const owned = await tx.agency.findUniqueOrThrow({
          where: { id: user.agencyId },
          include: {
            _count: {
              select: {
                users: true,
                leads: true,
                packages: true,
                quotes: true,
                bookings: true,
                spends: true,
                activities: true,
                invitations: true,
              },
            },
          },
        });
        if (
          Object.entries(owned._count).some(([key, n]) =>
            key === "users" ? n > 1 : n > 0,
          )
        )
          throw new HttpError(
            409,
            "This account already belongs to a populated agency. Use a separate work email or contact support; no records have been moved.",
          );
      }
      const previous = user.agencyId;
      await tx.user.update({
        where: { id: user.id },
        data: { agencyId: target.id, role: invitation.role },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "Accepted", acceptedAt: new Date() },
      });
      if (previous && previous !== target.id)
        await tx.agency.delete({ where: { id: previous } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.activity.create({
        data: {
          agencyId: target.id,
          actor: user.id,
          action: `Invitation accepted: ${user.name}, ${invitation.role}`,
        },
      });
      return {
        message:
          "Invitation accepted. Sign in again to open your team workspace.",
      };
    },
    { isolationLevel: "Serializable" },
  );
}
