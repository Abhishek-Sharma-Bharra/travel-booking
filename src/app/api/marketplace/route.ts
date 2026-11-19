import { z } from "zod";
import { hotelSession } from "@/lib/hotels/http";
import { sameOrigin, jsonBody, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import {
  registerBusiness,
  businessCommand,
  ownDashboard,
} from "@/lib/marketplace/business";
import {
  bookingQuote,
  requestBooking,
  changeBooking,
} from "@/lib/marketplace/bookings";
import { marketplaceError } from "@/lib/marketplace/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const s = await hotelSession(req);
    await limitRequests("mp-read:" + s.user.id, 60);
    return Response.json(await ownDashboard(s.user.id), {
      headers: privateHeaders,
    });
  } catch (e) {
    return marketplaceError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const s = await hotelSession(req);
    await limitRequests("mp-write:" + s.user.id, 30);
    const { action, payload } = z
      .object({
        action: z.enum(["register", "business", "quote", "request", "booking"]),
        payload: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(req, 20000));
    const functions = {
      register: registerBusiness,
      business: businessCommand,
      quote: bookingQuote,
      request: requestBooking,
      booking: changeBooking,
    };
    return Response.json(await functions[action](s.user.id, payload), {
      headers: privateHeaders,
    });
  } catch (e) {
    return marketplaceError(e);
  }
}
