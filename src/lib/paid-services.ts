// Keys alone never opt an account into paid AI usage.
export const paidAiEnabled = () => process.env.PAID_AI_ENABLED === "true";
