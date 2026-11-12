// Operator-only: needs direct database credentials. Never expose this as a public API.
import { db } from "../src/lib/db";
import { limitsFor } from "../src/lib/subscriptions";
async function main() {
  const [agencyId, plan, status, daysText] = process.argv.slice(2);
  if (
    !agencyId ||
    !["Starter", "Growth", "Professional"].includes(plan) ||
    !["Trial", "Active", "Paused", "Cancelled"].includes(status)
  )
    throw new Error(
      "Usage: npm run subscription -- <agency-id> <Starter|Growth|Professional> <Trial|Active|Paused|Cancelled> [valid-days; required for Active]",
    );
  const days = Number(daysText);
  if (
    status === "Active" &&
    (!Number.isInteger(days) || days < 1 || days > 366)
  )
    throw new Error(
      "Active subscriptions require an explicit 1–366 day validity period.",
    );
  await db.$transaction(
    async (tx) => {
      const a = await tx.agency.findUniqueOrThrow({ where: { id: agencyId } });
      if (a.demo) throw new Error("Demo subscription cannot be changed");
      const used =
        (await tx.user.count({ where: { agencyId, disabled: false } })) +
        (await tx.invitation.count({
          where: { agencyId, status: "Pending", expiresAt: { gt: new Date() } },
        }));
      if (used > limitsFor(plan).seats)
        throw new Error(
          "Disable members or revoke invitations before downgrading this plan.",
        );
      await tx.agency.update({
        where: { id: agencyId },
        data: {
          plan,
          subscription: status,
          subscriptionExpiresAt:
            status === "Active" ? new Date(Date.now() + days * 86400000) : null,
        },
      });
      await tx.activity.create({
        data: {
          agencyId,
          actor: "platform-operator",
          action: `Manual subscription update: ${plan}, ${status}${status === "Active" ? `, ${days} days` : ""}`,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  console.log("Subscription access updated. No payment was processed.");
}
main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
