import { db } from "../src/lib/db";
async function main() {
  const agencies = await db.agency.findMany({
    where: { demo: false },
    select: {
      id: true,
      name: true,
      plan: true,
      subscription: true,
      trialEndsAt: true,
      subscriptionExpiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  console.table(agencies);
}
main()
  .catch(() => {
    console.error("Could not list agencies. Check database access.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
