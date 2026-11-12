import { z } from "zod";
export const requestPrefix = "Subscription request: ";
export const subscriptionRequestSchema = z.object({
  plan: z.enum(["Starter", "Growth", "Professional"]),
  type: z.enum([
    "Start subscription",
    "Renew",
    "Upgrade",
    "Cancel at period end",
  ]),
});
export function readSubscriptionRequest(action: string) {
  if (!action.startsWith(requestPrefix)) return null;
  try {
    return subscriptionRequestSchema.parse(
      JSON.parse(action.slice(requestPrefix.length)),
    );
  } catch {
    return null;
  }
}
