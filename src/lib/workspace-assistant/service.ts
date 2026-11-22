import { HttpError } from "../http";
import type { Actor } from "../access";
import { assistantInput, guidedPlan } from "./contracts";
import {
  assistantActor,
  reserveAssistant,
  finishAssistant,
  assistantUsage,
} from "./store";
import {
  requireAssistantProvider,
  routeAssistant,
  assistantLiveAgencyApproved,
} from "./provider";
import { executeAssistantTool } from "./tools";
export function requireWorkspaceAssistant() {
  if (process.env.WORKSPACE_ASSISTANT_ENABLED !== "true")
    throw new HttpError(404, "The workspace assistant is not enabled yet");
}
export async function runWorkspaceAssistant(
  actor: Actor,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  requireWorkspaceAssistant();
  const v = assistantInput.parse(input);
  await assistantActor(actor);
  if (
    /passport|aadhaar|aadhar|credit card|debit card|cvv|bank account/i.test(
      v.question,
    )
  )
    throw new HttpError(
      400,
      "Remove identity-document and payment details from the question",
    );
  if (v.mode === "LIVE") {
    requireAssistantProvider();
    if (!assistantLiveAgencyApproved(actor.agencyId))
      throw new HttpError(
        403,
        "Live assistant routing is not approved for this agency. Guided tools remain available.",
      );
  }
  const id = await reserveAssistant(actor, v);
  let plan = guidedPlan(v),
    usage: { input: number; output: number } | undefined;
  try {
    if (v.mode === "LIVE") {
      const routed = await routeAssistant(v, transport);
      plan = { ...routed.plan, language: v.language };
      usage = routed.usage;
    }
    const result = await executeAssistantTool(actor, v, plan);
    await finishAssistant(actor, id, plan.tool, "SUCCEEDED", usage);
    return {
      requestId: v.requestId,
      mode: v.mode,
      result,
      reviewRequired: !!result.draft,
    };
  } catch (e) {
    try {
      await finishAssistant(
        actor,
        id,
        plan.tool,
        "FAILED",
        usage,
        e instanceof HttpError ? `HTTP_${e.status}` : "UNCONFIRMED",
      );
    } catch {
      console.error("ASSISTANT_USAGE_RECONCILIATION_REQUIRED");
    }
    throw e;
  }
}
export async function workspaceAssistantStatus(actor: Actor) {
  requireWorkspaceAssistant();
  return {
    liveEnabled:
      process.env.PAID_AI_ENABLED === "true" &&
      process.env.WORKSPACE_ASSISTANT_LIVE_APPROVED === "true" &&
      assistantLiveAgencyApproved(actor.agencyId) &&
      !!process.env.AI_API_KEY,
    usage: await assistantUsage(actor),
  };
}
