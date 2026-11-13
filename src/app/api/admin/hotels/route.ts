import { hotelSession, hotelError } from "@/lib/hotels/http";
import {
  requireHotels,
  hotelReviewQueue,
  reviewHotel,
} from "@/lib/hotels/service";
import { sameOrigin, jsonBody, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    requireHotels();
    const s = await hotelSession(req);
    await limitRequests(`hotel-review-read:${s.user.id}`, 30);
    return Response.json(await hotelReviewQueue(s.user.id, s.session.token), {
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
    await limitRequests(`hotel-review-write:${s.user.id}`, 20);
    return Response.json(
      await reviewHotel(s.user.id, s.session.token, await jsonBody(req, 4096)),
      { headers: privateHeaders },
    );
  } catch (e) {
    return hotelError(e);
  }
}
