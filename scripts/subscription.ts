// Operator-only administration. This script requires direct database access; never expose it as an API.
import { db } from "../src/lib/db";
async function main() {
  const [agencyId, plan, status] = process.argv.slice(2);
  if (
    !agencyId ||
    !["Starter", "Growth", "Professional"].includes(plan) ||
    !["Trial", "Active", "Paused", "Cancelled"].includes(status)
  )
    throw new Error(
      "Usage: npm run subscription -- <agency-id> <Starter|Growth|Professional> <Trial|Active|Paused|Cancelled>",
    );
  await db.$transaction(async (tx) => {
    const a = await tx.agency.findUniqueOrThrow({ where: { id: agencyId } });
    if (a.demo) throw new Error("Demo subscription cannot be changed");
    await tx.agency.update({
      where: { id: agencyId },
      data: { plan, subscription: status },
    });
    await tx.activity.create({
      data: {
        agencyId,
        actor: "platform-operator",
        action: `Manual subscription update: ${plan}, ${status}`,
      },
    });
  });
  console.log("Subscription metadata updated. No payment was processed.");
}
main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
