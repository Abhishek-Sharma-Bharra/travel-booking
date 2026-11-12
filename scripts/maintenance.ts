import { db } from "../src/lib/db";
async function main() {
  const now = new Date();
  const [b, v, i, r] = await db.$transaction([
    db.requestBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.invitation.updateMany({
      where: { status: "Pending", expiresAt: { lt: now } },
      data: { status: "Expired" },
    }),
    db.rateLimit.deleteMany({
      where: { lastRequest: { lt: BigInt(Date.now() - 7 * 86400000) } },
    }),
  ]);
  console.log({
    expiredRequestBuckets: b.count,
    expiredVerificationTokens: v.count,
    expiredInvitations: i.count,
    oldAuthBuckets: r.count,
  });
}
main()
  .catch(() => {
    console.error("Maintenance failed. Check database access.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
