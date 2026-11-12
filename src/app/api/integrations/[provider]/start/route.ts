import { actor } from "@/lib/session";
import { startAuthorization } from "@/lib/integrations/service";
import { sameOrigin, privateHeaders, errorResponse } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests(`oauth:${a.id}`, 5, 600);
    return Response.json(
      await startAuthorization(a, (await params).provider.toUpperCase()),
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
