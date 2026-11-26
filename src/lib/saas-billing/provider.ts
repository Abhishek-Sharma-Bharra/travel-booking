import { z } from "zod";
import { HttpError } from "../http";
import { providerJson } from "../integrations/provider-http";
import type { SandboxConfig, TestPlan } from "./config";
export const subscriptionId = z.string().regex(/^sub_[A-Za-z0-9]{1,80}$/);
export const paymentId = z.string().regex(/^pay_[A-Za-z0-9]{1,80}$/);
export const invoiceId = z.string().regex(/^inv_[A-Za-z0-9]{1,80}$/);
export const refundId = z.string().regex(/^rfnd_[A-Za-z0-9]{1,80}$/);
export async function provider(
  config: SandboxConfig,
  path: string,
  transport: typeof fetch,
  body?: unknown,
) {
  if (
    !/^\/(plans\/plan_[A-Za-z0-9]+|subscriptions(?:\/sub_[A-Za-z0-9]+)?|payments\/pay_[A-Za-z0-9]+(?:\/refunds\/rfnd_[A-Za-z0-9]+)?|invoices\/inv_[A-Za-z0-9]+)$/.test(
      path,
    ) ||
    (body !== undefined && path !== "/subscriptions")
  )
    throw new HttpError(400, "Unsupported internal billing endpoint");
  return providerJson(
    "https://api.razorpay.com/v1" + path,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(config.keyId + ":" + config.secret).toString("base64"),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    transport,
  );
}
export async function verifyPlan(
  config: SandboxConfig,
  plan: TestPlan,
  transport: typeof fetch,
) {
  const p = z
    .object({
      id: z.string(),
      period: z.string(),
      interval: z.number(),
      item: z.object({ amount: z.number(), currency: z.string() }),
    })
    .parse(await provider(config, "/plans/" + plan.providerPlanId, transport));
  if (
    p.id !== plan.providerPlanId ||
    p.period !== plan.period ||
    p.interval !== 1 ||
    p.item.amount !== plan.amountPaise ||
    p.item.currency !== plan.currency
  )
    throw new HttpError(
      409,
      "Provider plan differs from the reviewed test quote. No checkout was created.",
    );
}
export const subscriptionSchema = z.object({
  id: subscriptionId,
  plan_id: z.string(),
  status: z.enum([
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "paused",
    "cancelled",
    "completed",
    "expired",
  ]),
  notes: z.object({
    travelos_checkout: z.string(),
    travelos_mode: z.literal("test"),
  }),
});
