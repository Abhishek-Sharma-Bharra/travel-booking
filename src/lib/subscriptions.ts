import type { Agency, Prisma } from "@prisma/client";
import { HttpError } from "./http";
export const planLimits = {
  Starter: { seats: 3, leads: 3000 },
  Growth: { seats: 10, leads: 10000 },
  Professional: { seats: 25, leads: 25000 },
} as const;
export function limitsFor(plan: string) {
  return planLimits[plan as keyof typeof planLimits] ?? planLimits.Starter;
}
export function subscriptionAccess(
  agency: Pick<
    Agency,
    "subscription" | "trialEndsAt" | "subscriptionExpiresAt"
  >,
  now = new Date(),
) {
  if (agency.subscription === "Trial") return +agency.trialEndsAt > +now;
  return (
    agency.subscription === "Active" &&
    (!agency.subscriptionExpiresAt || +agency.subscriptionExpiresAt > +now)
  );
}
export function requireSubscription(agency: Agency) {
  if (!subscriptionAccess(agency))
    throw new HttpError(
      403,
      "Your trial or subscription is inactive. Existing records remain readable and exportable. Contact support to renew.",
    );
}
export async function ensureSeat(
  tx: Prisma.TransactionClient,
  agency: Agency,
  extra = 1,
) {
  await tx.$queryRaw`SELECT "id" FROM "Agency" WHERE "id"=${agency.id} FOR UPDATE`;
  const active = await tx.user.count({
    where: { agencyId: agency.id, disabled: false },
  });
  const pending = await tx.invitation.count({
    where: {
      agencyId: agency.id,
      status: "Pending",
      expiresAt: { gt: new Date() },
    },
  });
  if (active + pending + extra > limitsFor(agency.plan).seats)
    throw new HttpError(
      409,
      "Your plan’s team limit has been reached. Revoke unused invitations, disable a member, or contact support to upgrade.",
    );
}
