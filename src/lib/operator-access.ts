import { db } from "./db";
import { HttpError } from "./http";
export async function requireOperator(userId: string, sessionToken: string) {
  const u = await db.user.findUnique({ where: { id: userId } });
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (
    !u ||
    u.disabled ||
    !u.emailVerified ||
    !u.twoFactorEnabled ||
    !allowed.includes(u.email.toLowerCase())
  )
    throw new HttpError(
      403,
      "Verified service administrator access with two-factor authentication is required",
    );
  const session = await db.session.findFirst({
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
