import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { acceptInvitation } from "@/lib/invitations";
import {
  sameOrigin,
  jsonBody,
  HttpError,
  errorResponse,
  privateHeaders,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new HttpError(401, "Please sign in");
    await limitRequests(`invite-accept:${session.user.id}`, 10);
    const { token } = z
      .object({ token: z.string().max(100) })
      .parse(await jsonBody(req, 2048));
    return Response.json(await acceptInvitation(session.user.id, token), {
      headers: privateHeaders,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
