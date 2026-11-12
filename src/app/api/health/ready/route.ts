import { db } from "@/lib/db";
import { launchGaps } from "@/lib/readiness";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const ready = (await launchGaps()).length === 0;
    return Response.json(
      { status: ready ? "ready" : "not-ready" },
      { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "not-ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
