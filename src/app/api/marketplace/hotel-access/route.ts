import { cookies } from "next/headers";
import { z } from "zod";
import { hotelSession } from "@/lib/hotels/http";
import { sameOrigin, jsonBody, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { hotelAccess } from "@/lib/marketplace/hotel-access";
import { marketplaceError } from "@/lib/marketplace/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const s = await hotelSession(req);
    await limitRequests("mp-hotel-access:" + s.user.id, 10);
    const { bookingId } = z
      .object({ bookingId: z.string().min(1).max(100) })
      .strict()
      .parse(await jsonBody(req, 1000));
    const result = await hotelAccess(s.user.id, bookingId);
    const jar = await cookies();
    jar.set("hotel_guest_" + result.hotelId, result.secret, {
      httpOnly: true,
      secure: new URL(req.url).protocol === "https:",
      sameSite: "lax",
      path: "/api/public/hotels/" + result.hotelId,
      maxAge: 7 * 86400,
    });
    return Response.json({ url: result.url }, { headers: privateHeaders });
  } catch (e) {
    return marketplaceError(e);
  }
}
