import { hotelSession, hotelError } from "@/lib/hotels/http";
import { transportOperations } from "@/lib/marketplace/operations";
import { privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const s = await hotelSession(req);
    await limitRequests(`transport-ops:${s.user.id}`, 30);
    const q = z
      .object({
        businessId: z.string().min(1).max(100),
        month: z.string().max(7),
      })
      .strict()
      .parse(Object.fromEntries(new URL(req.url).searchParams));
    return Response.json(
      await transportOperations(s.user.id, q.businessId, q.month),
      { headers: privateHeaders },
    );
  } catch (e) {
    return hotelError(e);
  }
}
