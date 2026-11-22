import { actor } from "@/lib/session";
import {
  jsonBody,
  sameOrigin,
  privateHeaders,
  HttpError,
  errorResponse,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import {
  runWorkspaceAssistant,
  workspaceAssistantStatus,
} from "@/lib/workspace-assistant/service";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof HttpError) return errorResponse(e);
  if (e instanceof ZodError)
    return errorResponse(
      new HttpError(
        400,
        "Review the assistant tool, selected records and travel dates",
      ),
    );
  if (e instanceof Error && e.message === "Please sign in")
    return errorResponse(e);
  if ((e as { code?: string })?.code === "P2034")
    return errorResponse(
      new HttpError(
        409,
        "Assistant usage changed during another request. Review usage before starting a new request.",
      ),
    );
  console.error("WORKSPACE_ASSISTANT_FAILED", {
    name: e instanceof Error ? e.name : "UnknownError",
  });
  return errorResponse(
    new HttpError(
      503,
      "The assistant result could not be confirmed. No automatic business action was performed; review usage before starting a new request.",
    ),
  );
}
export async function GET() {
  try {
    const a = await actor();
    await limitRequests(`assistant-status:${a.id}`, 30);
    return Response.json(await workspaceAssistantStatus(a), {
      headers: privateHeaders,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests(`assistant-tools:${a.id}`, 20);
    return Response.json(
      await runWorkspaceAssistant(a, await jsonBody(req, 12000)),
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
