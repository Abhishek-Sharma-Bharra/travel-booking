import { actor } from "@/lib/session";
import { mutate } from "@/lib/actions";
import {
  jsonBody,
  sameOrigin,
  errorResponse,
  privateHeaders,
  HttpError,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { z, ZodError } from "zod";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests(`mutation:${a.agencyId}:${a.id}`);
    const body = z
      .object({ action: z.string().max(40), input: z.unknown() })
      .parse(await jsonBody(req));
    return Response.json(await mutate(a, body.action, body.input), {
      headers: privateHeaders,
    });
  } catch (e) {
    if (e instanceof ZodError)
      return errorResponse(
        new HttpError(
          400,
          e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        ),
      );
    console.error("Mutation failed", {
      code:
        (e as { code?: string }).code ||
        ((e as Error).name === "HttpError"
          ? "REQUEST_REJECTED"
          : "REQUEST_FAILED"),
    });
    return errorResponse(e);
  }
}
