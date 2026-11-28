import { limitRequests } from "@/lib/rate-limit";
import { hash } from "@/lib/commerce/documents";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  sameOrigin,
  jsonBody,
  privateHeaders,
  errorResponse,
  HttpError,
} from "@/lib/http";
import {
  createCustomerOrder,
  reconcileCapturedPayment,
} from "@/lib/commerce/payments";
import { portalCookie, portalGrant } from "@/lib/commerce/portal";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const token = (await cookies()).get(portalCookie)?.value;
    await portalGrant(token);
    await limitRequests("customer-payment:" + hash(token!), 10);
    const v = z
      .object({ action: z.enum(["CREATE", "VERIFY"]), input: z.unknown() })
      .strict()
      .parse(await jsonBody(req, 1000));
    if (v.action === "CREATE")
      return Response.json(await createCustomerOrder(token, v.input), {
        headers: privateHeaders,
      });
    const g = await portalGrant(token),
      p = z
        .object({ paymentId: z.string().max(100) })
        .strict()
        .parse(v.input);
    return Response.json(
      await reconcileCapturedPayment(
        g.agencyId,
        p.paymentId,
        fetch,
        g.bookingId,
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(
      e instanceof z.ZodError
        ? new HttpError(400, "Review the payment request")
        : e,
    );
  }
}
