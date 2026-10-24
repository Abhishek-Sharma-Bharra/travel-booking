import { actor } from "@/lib/session";
import { workspaceData } from "@/lib/data";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await workspaceData(await actor()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Please sign in to an active workspace" },
      { status: 401 },
    );
  }
}
