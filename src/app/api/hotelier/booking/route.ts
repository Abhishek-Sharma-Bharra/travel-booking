import { hotelSession, hotelError } from "@/lib/hotels/http";
import {
  hotelBookingOverview,
  updateHotelInventory,
} from "@/lib/hotels/booking";
import { jsonBody, sameOrigin, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { z } from "zod";
import {
  configureHotelMerchant,
  reconcileHotelOrder,
} from "@/lib/hotels/payments";
export async function GET(req: Request) {
  try {
    const session = await hotelSession(req);
    await limitRequests(`hotel-inventory-read:${session.user.id}`, 30);
    return Response.json(
      await hotelBookingOverview(
        session.user.id,
        new URL(req.url).searchParams.get("hotelId") || "",
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return hotelError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const session = await hotelSession(req);
    await limitRequests(`hotel-inventory-write:${session.user.id}`, 15);
    const v = z
      .object({
        hotelId: z.string().min(1).max(100),
        action: z
          .enum(["inventory", "merchant", "reconcile"])
          .default("inventory"),
        input: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(req, 10000));
    return Response.json(
      v.action === "merchant"
        ? await configureHotelMerchant(
            session.user.id,
            session.session.token,
            v.hotelId,
            v.input,
          )
        : v.action === "reconcile"
          ? await reconcileHotelOrder(session.user.id, v.hotelId, v.input)
          : await updateHotelInventory(session.user.id, v.hotelId, v.input),
      { headers: privateHeaders },
    );
  } catch (e) {
    return hotelError(e);
  }
}
