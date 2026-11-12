import { actor } from "@/lib/session";
import { readTour, saveTour } from "@/lib/tour-service";
import {
  sameOrigin,
  jsonBody,
  errorResponse,
  privateHeaders,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export async function GET() {
  try {
    const a = await actor();
    await limitRequests("tour-read:" + a.id, 60);
    return Response.json(await readTour(a), { headers: privateHeaders });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests("tour-write:" + a.id, 90);
    return Response.json(await saveTour(a, await jsonBody(req, 2000)), {
      headers: privateHeaders,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
