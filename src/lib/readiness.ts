import { mailReady, verificationRequired } from "./mail";
import { db } from "./db";
export function configurationGaps() {
  const gaps: string[] = [];
  try {
    const u = new URL(
      process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "",
    );
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash
    )
      gaps.push("HTTPS application origin");
  } catch {
    gaps.push("HTTPS application origin");
  }
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32 ||
    /replace|default-secret/i.test(process.env.BETTER_AUTH_SECRET)
  )
    gaps.push("Strong authentication secret");
  if (!mailReady()) gaps.push("Email delivery");
  if (!verificationRequired()) gaps.push("Required email verification");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SUPPORT_EMAIL || ""))
    gaps.push("Support email");
  if (!process.env.PLATFORM_ADMIN_EMAILS)
    gaps.push("Service administrator allowlist");
  return gaps;
}
export async function launchGaps() {
  const gaps = configurationGaps();
  try {
    await db.$queryRaw`SELECT 1`;
    const privileges = await db.$queryRaw<
      { powerful: boolean }[]
    >`SELECT (rolsuper OR rolcreaterole OR rolcreatedb OR has_schema_privilege(current_user,'public','CREATE')) AS powerful FROM pg_roles WHERE rolname=current_user`;
    if (privileges[0]?.powerful)
      gaps.push("Least-privilege runtime database role");
    await db.requestBucket.findFirst({ select: { key: true } });
    await db.invitation.findFirst({ select: { id: true } });
    const emails = (process.env.PLATFORM_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (
      !(await db.user.findFirst({
        where: {
          email: { in: emails },
          emailVerified: true,
          twoFactorEnabled: true,
          disabled: false,
        },
        select: { id: true },
      }))
    )
      gaps.push("Verified service administrator with authenticator enabled");
  } catch {
    gaps.push("Database connection or security migrations");
  }
  return gaps;
}
