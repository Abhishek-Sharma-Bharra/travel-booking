import { db } from "./db";
import { requireOwner, type Actor } from "./access";
import {
  requestPrefix,
  subscriptionRequestSchema,
} from "./subscription-request-format";
export async function requestSubscription(a: Actor, input: unknown) {
  requireOwner(a);
  const v = subscriptionRequestSchema.parse(input);
  // Agency is derived from the authenticated actor, never from client input.
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Agency" WHERE "id"=${a.agencyId} FOR UPDATE`;
    const action = requestPrefix + JSON.stringify(v);
    const duplicate = await tx.activity.findFirst({
      where: {
        agencyId: a.agencyId,
        action,
        createdAt: { gte: new Date(Date.now() - 86400000) },
      },
    });
    if (!duplicate)
      await tx.activity.create({
        data: { agencyId: a.agencyId, actor: a.id, action },
      });
    return {
      message: duplicate
        ? "This request was already recorded today. No duplicate was created."
        : "Request recorded for service administrator review. No payment was taken and your subscription has not changed.",
    };
  });
}
