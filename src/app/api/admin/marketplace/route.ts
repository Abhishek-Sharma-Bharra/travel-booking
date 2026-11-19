import { hotelSession } from "@/lib/hotels/http";
import { sameOrigin, jsonBody, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { adminDashboard, adminCommand } from "@/lib/marketplace/admin";
import { marketplaceError } from "@/lib/marketplace/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const s = await hotelSession(req);
    await limitRequests("mp-admin:" + s.user.id, 30);
    return Response.json(await adminDashboard(s.user.id, s.session.token), {
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
    await limitRequests("mp-admin:" + s.user.id, 30);
    return Response.json(
      await adminCommand(
        s.user.id,
        s.session.token,
        await jsonBody(req, 16000),
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return marketplaceError(e);
  }
}
