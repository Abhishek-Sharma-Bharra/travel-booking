import { publicSearch } from "@/lib/marketplace/business";
import { marketplaceError } from "@/lib/marketplace/http";
import { limitRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    await limitRequests(
      "mp-public:" +
        (req.headers.get("CF-Connecting-IP") ||
          req.headers.get("X-Real-IP") ||
          "unknown"),
      60,
    );
    const q = new URL(req.url).searchParams;
    return Response.json(
      await publicSearch({
        kind: q.get("kind") || undefined,
        city: q.get("city") || undefined,
        start: q.get("start") || undefined,
        end: q.get("end") || undefined,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return marketplaceError(e);
  }
}
