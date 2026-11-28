import { reconcileOrder } from "@/lib/commerce/payments";
import { z } from "zod";
import { actor } from "@/lib/session";
import {
  sameOrigin,
  jsonBody,
  privateHeaders,
  errorResponse,
  HttpError,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import {
  commerceOverview,
  issueDocument,
  calculateDocument,
  manager,
} from "@/lib/commerce/documents";
import { inviteCustomer, revokeCustomerAccess } from "@/lib/commerce/portal";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
  return errorResponse(
    e instanceof z.ZodError
      ? new HttpError(
          400,
          "Review the document fields, tax details and booking email",
        )
      : e,
  );
}
export async function GET() {
  try {
    return Response.json(await commerceOverview(await actor()), {
      headers: privateHeaders,
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests(`commerce:${a.id}`, 15);
    const v = z
      .object({
        action: z.enum([
          "ISSUE",
          "INVITE",
          "REVOKE",
          "PREVIEW",
          "RECONCILE_ORDER",
        ]),
        input: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(req, 22000));
    if (v.action === "RECONCILE_ORDER")
      return Response.json(await reconcileOrder(a, v.input), {
        headers: privateHeaders,
      });
    if (v.action === "PREVIEW") {
      await manager(a);
      return Response.json(
        { ...calculateDocument(v.input), input: v.input },
        { headers: privateHeaders },
      );
    }
    const result =
      v.action === "ISSUE"
        ? await issueDocument(a, v.input)
        : v.action === "INVITE"
          ? await inviteCustomer(a, v.input)
          : await revokeCustomerAccess(
              a,
              z
                .object({ bookingId: z.string().min(1).max(100) })
                .strict()
                .parse(v.input).bookingId,
            );
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return fail(e);
  }
}
