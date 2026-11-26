import { HttpError, limitedBody, privateHeaders } from "@/lib/http";
import { billingFailure } from "@/lib/saas-billing/http";
import { verifyTestWebhook } from "@/lib/saas-billing/webhook";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    if (
      !req.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new HttpError(415, "Use a JSON webhook");
    const result = await verifyTestWebhook(
      await limitedBody(req, 64000),
      req.headers.get("x-razorpay-signature") || "",
      req.headers.get("x-razorpay-event-id") || "",
    );
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return billingFailure(e);
  }
}
