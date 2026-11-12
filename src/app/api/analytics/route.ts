import { actor } from "@/lib/session";
import { db } from "@/lib/db";
import { kpiData } from "@/lib/kpi-service";
import { privateHeaders, errorResponse, HttpError } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const params = Object.fromEntries(new URL(req.url).searchParams);
    let a;
    if (params.demo === "1") {
      await limitRequests("public-demo-analytics", 120);
      const agency = await db.agency.findFirst({
        where: { demo: true },
        select: { id: true },
      });
      if (!agency) throw new HttpError(404, "Fictional demo unavailable");
      a = {
        id: "demo-visitor",
        agencyId: agency.id,
        role: "OWNER",
        demo: true,
      };
    } else {
      a = await actor();
      await limitRequests(`analytics:${a.agencyId}:${a.id}`, 60);
    }
    return Response.json(await kpiData(a, params), { headers: privateHeaders });
  } catch (e) {
    return errorResponse(e);
  }
}
