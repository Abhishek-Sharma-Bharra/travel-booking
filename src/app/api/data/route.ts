import { actor } from "@/lib/session";
import { workspaceData } from "@/lib/data";
import { privateHeaders, errorResponse } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const a = await actor();
    await limitRequests(`read:${a.agencyId}:${a.id}`, 180);
    return Response.json(await workspaceData(a), { headers: privateHeaders });
  } catch (e) {
    return errorResponse(e);
  }
}
