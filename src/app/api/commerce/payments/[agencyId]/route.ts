import { paymentWebhook } from "@/lib/commerce/payments";
import {
  limitedBody,
  privateHeaders,
  errorResponse,
  HttpError,
} from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ agencyId: string }> },
) {
  try {
    const { agencyId } = await params;
    return Response.json(
      await paymentWebhook(
        agencyId,
        await limitedBody(req, 64000),
        req.headers.get("x-razorpay-signature") || "",
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(
      e instanceof HttpError
        ? e
        : new HttpError(
            503,
            "Payment callback could not be confirmed; provider retry or reconciliation is required",
          ),
    );
  }
}
