import { z } from "zod";
import { actor } from "@/lib/session";
import {
  automationOverview,
  saveAutomation,
  retryAutomation,
} from "@/lib/automation/service";
import {
  sameOrigin,
  jsonBody,
  privateHeaders,
  errorResponse,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export async function GET() {
  try {
    const a = await actor();
    await limitRequests("automation-read:" + a.id, 30);
    return Response.json(await automationOverview(a), {
      headers: privateHeaders,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests("automation-write:" + a.id, 15);
    const v = z
      .object({ action: z.enum(["policy", "retry"]), input: z.unknown() })
      .parse(await jsonBody(req, 5000));
    const result =
      v.action === "policy"
        ? await saveAutomation(a, v.input)
        : await retryAutomation(
            a,
            z.object({ id: z.string().max(200) }).parse(v.input).id,
          );
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return errorResponse(e);
  }
}
