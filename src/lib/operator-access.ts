import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
export async function requireOperator(
  userId: string,
  sessionToken: string,
  client: Prisma.TransactionClient = db,
) {
  const u = await client.user.findUnique({ where: { id: userId } });
  if (
    !u ||
    u.disabled ||
    !u.emailVerified ||
    !u.twoFactorEnabled ||
    !operatorEmailAllowed(u.email)
  )
    throw new HttpError(
      403,
      "Verified service administrator access with two-factor authentication is required",
    );
  const session = await client.session.findFirst({
    where: {
      token: sessionToken,
      userId: u.id,
      expiresAt: { gt: new Date() },
      mfaVerifiedAt: { gt: new Date(Date.now() - 4 * 3600000) },
    },
  });
  if (!session)
    throw new HttpError(
      403,
      "Verify your authenticator again to manage client subscriptions",
    );
  return u;
}

// The owner entry supplements rather than overwrites existing operator entries.
export function operatorEmailAllowed(email: string) {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const owner = (process.env.PLATFORM_OWNER_EMAIL || "").trim().toLowerCase();
  if (owner) allowed.push(owner);
  return allowed.includes(email.trim().toLowerCase());
}
