import { z } from "zod";
import { createHash } from "node:crypto";
import { HttpError } from "../http";
export const testPlanSchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
    label: z.string().trim().min(1).max(80),
    appPlan: z.enum(["Starter", "Growth", "Professional"]),
    providerPlanId: z.string().regex(/^plan_[A-Za-z0-9]{1,80}$/),
    amountPaise: z.number().int().min(100).max(100000000),
    currency: z.literal("INR"),
    period: z.enum(["monthly", "yearly"]),
    totalCycles: z.number().int().min(1).max(120),
    termsVersion: z.string().trim().min(1).max(80),
    taxLabel: z.string().trim().min(1).max(160),
    cancellationTerms: z.string().trim().min(1).max(600),
  })
  .strict();
export type TestPlan = z.infer<typeof testPlanSchema>;
export const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const planHash = (plan: TestPlan) => digest(JSON.stringify(plan));
export function sandboxConfig() {
  if (process.env.SAAS_BILLING_TEST_ENABLED !== "true")
    throw new HttpError(
      503,
      "SaaS sandbox billing is disabled. Manual subscription management remains available.",
    );
  const keyId = process.env.SAAS_TEST_RAZORPAY_KEY_ID || "",
    secret = process.env.SAAS_TEST_RAZORPAY_KEY_SECRET || "",
    webhookSecret = process.env.SAAS_TEST_RAZORPAY_WEBHOOK_SECRET || "";
  if (
    !/^rzp_test_[A-Za-z0-9]{1,80}$/.test(keyId) ||
    secret.length < 12 ||
    webhookSecret.length < 32
  )
    throw new HttpError(
      503,
      "Test merchant configuration is incomplete. Live keys are not accepted by this sandbox.",
    );
  let plans: TestPlan[];
  try {
    plans = z
      .array(testPlanSchema)
      .min(1)
      .max(8)
      .parse(JSON.parse(process.env.SAAS_BILLING_TEST_CATALOG_JSON || "[]"));
    if (new Set(plans.map((p) => p.code)).size !== plans.length) throw Error();
  } catch {
    throw new HttpError(
      503,
      "A reviewed test catalogue with explicit amounts and terms is required.",
    );
  }
  const agencyIds = (process.env.SAAS_BILLING_TEST_AGENCY_IDS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    !agencyIds.length ||
    agencyIds.length > 10 ||
    agencyIds.some((v) => v.length > 100)
  )
    throw new HttpError(
      503,
      "A small server-managed test agency allowlist is required.",
    );
  return { keyId, secret, webhookSecret, plans, agencyIds };
}
export type SandboxConfig = ReturnType<typeof sandboxConfig>;
export function requireBillingPilot(config: SandboxConfig, agencyId: string) {
  if (!config.agencyIds.includes(agencyId))
    throw new HttpError(
      403,
      "Test billing is not enabled for this agency. Manual subscriptions remain available.",
    );
}
export function publicTestPlan(plan: TestPlan) {
  const { providerPlanId, ...v } = plan;
  return { ...v, quoteHash: planHash(plan) };
}
