import { db } from "./db";
import { requireOperator } from "./operator-access";
import { configurationGaps } from "./readiness";
export { operatorEmailAllowed } from "./operator-access";
export async function adminOverview(userId: string, token: string) {
  await requireOperator(userId, token);
  const now = new Date();
  const [agencies, activeAccess, trials, hotels] = await Promise.all([
    db.agency.count({ where: { demo: false } }),
    db.agency.count({
      where: {
        demo: false,
        subscription: "Active",
        OR: [
          { subscriptionExpiresAt: null },
          { subscriptionExpiresAt: { gt: now } },
        ],
      },
    }),
    db.agency.count({
      where: { demo: false, subscription: "Trial", trialEndsAt: { gt: now } },
    }),
    db.hotel.count(),
  ]);
  return {
    asOf: now.toISOString(),
    agencies,
    activeAccess,
    trials,
    hotels,
    gaps: configurationGaps(),
    liveAI:
      process.env.PAID_AI_ENABLED === "true" &&
      process.env.WORKSPACE_ASSISTANT_LIVE_APPROVED === "true",
    testBilling: process.env.SAAS_BILLING_TEST_ENABLED === "true",
    liveHotelPayments: process.env.HOTEL_LIVE_PAYMENTS_APPROVED === "true",
  };
}
export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;
