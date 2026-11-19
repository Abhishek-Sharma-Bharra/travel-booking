import { hotelSession } from "@/lib/hotels/http";
import { privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { vehicleCalendar } from "@/lib/marketplace/calendar";
import { marketplaceError } from "@/lib/marketplace/http";
export async function GET(req: Request) {
  try {
    const s = await hotelSession(req);
    await limitRequests("mp-calendar:" + s.user.id, 30);
    return Response.json(
      await vehicleCalendar(
        s.user.id,
        Object.fromEntries(new URL(req.url).searchParams),
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return marketplaceError(e);
  }
}
