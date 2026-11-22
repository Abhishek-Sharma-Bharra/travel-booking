import { hotelSession, hotelError } from "@/lib/hotels/http";
import {
  hotelOperationsOverview,
  hotelGuestCommand,
} from "@/lib/hotels/operations";
import { jsonBody, sameOrigin, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const s = await hotelSession(req);
    await limitRequests(`guest-ops-read:${s.user.id}`, 30);
    const q = z
      .object({ hotelId: z.string().min(1).max(100), month: z.string().max(7) })
      .strict()
      .parse(Object.fromEntries(new URL(req.url).searchParams));
    return Response.json(
      await hotelOperationsOverview(s.user.id, q.hotelId, q.month),
      { headers: privateHeaders },
    );
  } catch (e) {
    return hotelError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const s = await hotelSession(req);
    await limitRequests(`guest-ops-write:${s.user.id}`, 15);
    return Response.json(
      await hotelGuestCommand(s.user.id, await jsonBody(req, 4000)),
      { headers: privateHeaders },
    );
  } catch (e) {
    return hotelError(e);
  }
}
