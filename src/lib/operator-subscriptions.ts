import { z } from "zod";
import { db } from "./db";
import { requireOperator } from "./operator-access";
import { limitsFor } from "./subscriptions";
import { HttpError } from "./http";
export async function updateSubscription(
  operatorId: string,
  input: unknown,
  sessionToken: string,
) {
  await requireOperator(operatorId, sessionToken);
  const v = z
    .object({
      agencyId: z.string().min(1),
      plan: z.enum(["Starter", "Growth", "Professional"]),
      status: z.enum(["Trial", "Active", "Paused", "Cancelled"]),
      days: z.coerce.number().int().min(1).max(366),
    })
    .parse(input);
  await db.$transaction(
    async (tx) => {
      const a = await tx.agency.findUniqueOrThrow({
        where: { id: v.agencyId },
      });
      if (a.demo)
        throw new HttpError(403, "Demo subscription cannot be changed");
      await tx.$queryRaw`SELECT "id" FROM "Agency" WHERE "id"=${a.id} FOR UPDATE`;
      const seats =
        (await tx.user.count({ where: { agencyId: a.id, disabled: false } })) +
        (await tx.invitation.count({
          where: {
            agencyId: a.id,
            status: "Pending",
            expiresAt: { gt: new Date() },
          },
        }));
      if (seats > limitsFor(v.plan).seats)
        throw new HttpError(
          409,
          "Disable members or revoke invitations before downgrading.",
        );
      await tx.agency.update({
        where: { id: a.id },
        data: {
          plan: v.plan,
          subscription: v.status,
          subscriptionExpiresAt:
            v.status === "Active"
              ? new Date(Date.now() + v.days * 86400000)
              : null,
        },
      });
      await tx.activity.create({
        data: {
          agencyId: a.id,
          actor: operatorId,
          action: `Service administrator subscription update: ${v.plan}, ${v.status}${v.status === "Active" ? `, ${v.days} days` : ""}; manual billing`,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  return {
    message: "Subscription updated. No payment was collected or processed.",
  };
}
