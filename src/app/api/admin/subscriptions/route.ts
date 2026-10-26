import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireOperator } from "@/lib/operator-access";
import { updateSubscription } from "@/lib/operator-subscriptions";
import {
  sameOrigin,
  jsonBody,
  errorResponse,
  HttpError,
  privateHeaders,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) throw new HttpError(401, "Please sign in");
    await requireOperator(s.user.id, s.session.token);
    await limitRequests(`operator:${s.user.id}`, 20);
    return Response.json(
      await updateSubscription(
        s.user.id,
        await jsonBody(req, 4096),
        s.session.token,
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
