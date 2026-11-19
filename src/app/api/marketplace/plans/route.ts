import { database } from "@/lib/marketplace/core";
import { marketplaceError } from "@/lib/marketplace/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(
      {
        plans: (
          await database().prepare("SELECT * FROM MPPlan ORDER BY id").all()
        ).results,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (e) {
    return marketplaceError(e);
  }
}
