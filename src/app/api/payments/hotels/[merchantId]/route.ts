import { limitedBody, privateHeaders } from "@/lib/http";
import { hotelError } from "@/lib/hotels/http";
import { hotelPaymentWebhook } from "@/lib/hotels/payments";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ merchantId: string }> },
) {
  try {
    const { merchantId } = await params;
    return Response.json(
      await hotelPaymentWebhook(
        merchantId,
        await limitedBody(req, 64000),
        req.headers.get("x-razorpay-signature"),
        req.headers.get("x-razorpay-event-id"),
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return hotelError(e);
  }
}
