import { db } from "../src/lib/db";
import { demoFixture } from "../src/lib/demo-fixture";
async function seed() {
  if (await db.agency.findUnique({ where: { id: "demo-agency" } })) {
    console.log("Demo already exists; left unchanged.");
    return;
  }
  const data = demoFixture();
  await db.$transaction(
    async (tx) => {
      await tx.agency.create({ data: data.agency });
      await tx.user.createMany({ data: data.users });
      await tx.package.createMany({ data: data.packages });
      await tx.lead.createMany({ data: data.leads });
      await tx.quote.createMany({ data: data.quotes });
      await tx.booking.createMany({ data: data.bookings });
      await tx.transaction.createMany({ data: data.transactions });
      await tx.activity.createMany({ data: data.activities });
      await tx.spend.createMany({ data: data.spends });
    },
    { timeout: 60000 },
  );
  console.log(
    "Seeded isolated read-only demo: 1,500 enquiries, 330 bookings, six completed months.",
  );
}
seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
