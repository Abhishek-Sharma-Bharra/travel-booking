import { actor } from "@/lib/session";
import { privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { testReceipt } from "@/lib/saas-billing/service";
import { billingFailure } from "@/lib/saas-billing/http";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await actor();
    await limitRequests(`test-billing-receipt:${a.id}`, 20);
    const { id } = await params;
    const receipt = await testReceipt(a, id);
    return Response.json(receipt, {
      headers: {
        ...privateHeaders,
        "Content-Disposition": `attachment; filename="travelos-sandbox-${id}.json"`,
      },
    });
  } catch (e) {
    return billingFailure(e);
  }
}
