import { hotelSession } from "@/lib/hotels/http";
import { answerBusinessQuestion } from "@/lib/business-assistant/service";
import {
  jsonBody,
  sameOrigin,
  privateHeaders,
  HttpError,
  errorResponse,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const s = await hotelSession(req);
    await limitRequests(`supplier-assistant:${s.user.id}`, 15);
    return Response.json(
      await answerBusinessQuestion(s.user.id, await jsonBody(req, 2500)),
      { headers: privateHeaders },
    );
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    if (e instanceof ZodError)
      return errorResponse(
        new HttpError(
          400,
          "Choose a valid business, reporting month, language and a question under 500 characters",
        ),
      );
    console.error("BUSINESS_ASSISTANT_UNAVAILABLE");
    return errorResponse(
      new HttpError(
        503,
        "Business lookup is unavailable. No business action was performed.",
      ),
    );
  }
}
