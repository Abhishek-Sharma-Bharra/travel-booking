import { hotelSession, hotelError } from "@/lib/hotels/http";
import {
  requireHotels,
  hotelOverview,
  mutateHotel,
} from "@/lib/hotels/service";
import { sameOrigin, jsonBody, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    requireHotels();
    const s = await hotelSession(req);
    await limitRequests(`hotels-read:${s.user.id}`, 60);
    return Response.json(await hotelOverview(s.user.id), {
      headers: privateHeaders,
    });
  } catch (e) {
    return hotelError(e);
  }
}
export async function POST(req: Request) {
  try {
    requireHotels();
    sameOrigin(req);
    const s = await hotelSession(req);
    await limitRequests(`hotels-write:${s.user.id}`, 20);
    return Response.json(
      await mutateHotel(s.user.id, await jsonBody(req, 40000)),
      { headers: privateHeaders },
    );
  } catch (e) {
    return hotelError(e);
  }
}
