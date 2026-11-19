import { hotelSession } from "@/lib/hotels/http";
import { privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { report } from "@/lib/marketplace/report";
import { marketplaceError } from "@/lib/marketplace/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const s = await hotelSession(req);
    await limitRequests("mp-export:" + s.user.id, 10);
    const query = new URL(req.url).searchParams;
    const admin = query.get("admin") === "true";
    query.delete("admin");
    const result = await report(
      s.user.id,
      query,
      admin ? s.session.token : undefined,
    );
    return new Response(result.csv, {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Next-Cursor": result.cursor,
      },
    });
  } catch (e) {
    return marketplaceError(e);
  }
}
