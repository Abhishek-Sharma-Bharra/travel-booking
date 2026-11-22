import { actor } from "@/lib/session";
import {
  itineraryOverview,
  itineraryCommand,
} from "@/lib/workspace-operations/itineraries";
import {
  sameOrigin,
  jsonBody,
  privateHeaders,
  HttpError,
  errorResponse,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { z, ZodError } from "zod";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof ZodError)
    return errorResponse(
      new HttpError(
        400,
        "Review itinerary days, dates, quantities and INR amounts",
      ),
    );
  if (
    error instanceof HttpError ||
    (error instanceof Error && error.message === "Please sign in")
  )
    return errorResponse(error);
  if ((error as { code?: string })?.code === "P2034")
    return errorResponse(
      new HttpError(
        409,
        "Itinerary changed during another update. Reload before retrying.",
      ),
    );
  console.error("WORKSPACE_OPERATIONS_FAILED", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return errorResponse(
    new HttpError(
      503,
      "Itinerary service unavailable. Check whether your change was saved before retrying.",
    ),
  );
}
export async function GET(req: Request) {
  try {
    if (process.env.WORKSPACE_OPERATIONS_ENABLED !== "true")
      throw new HttpError(404, "Workspace operations are not enabled");
    const a = await actor();
    await limitRequests(`workspace-operations-read:${a.id}`, 60);
    const q = z
      .object({
        id: z.string().min(1).max(100).optional(),
        version: z.string().min(1).max(100).optional(),
        page: z.coerce.number().int().min(0).max(100).default(0),
      })
      .strict()
      .refine(
        (q) => !q.version || !!q.id,
        "Select an itinerary before a version",
      )
      .parse(Object.fromEntries(new URL(req.url).searchParams));
    return Response.json(await itineraryOverview(a, q), {
      headers: privateHeaders,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (process.env.WORKSPACE_OPERATIONS_ENABLED !== "true")
      throw new HttpError(404, "Workspace operations are not enabled");
    const a = await actor();
    await limitRequests(`workspace-operations-write:${a.id}`, 20);
    return Response.json(
      await itineraryCommand(a, await jsonBody(req, 250000)),
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
