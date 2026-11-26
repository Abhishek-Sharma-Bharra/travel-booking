import { z } from "zod";
import { actor } from "@/lib/session";
import { sameOrigin, jsonBody, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import {
  billingStatus,
  createTestCheckout,
  reconcileTestCheckout,
} from "@/lib/saas-billing/service";
import { billingFailure } from "@/lib/saas-billing/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const a = await actor();
    await limitRequests(`test-billing-status:${a.id}`, 30);
    return Response.json(await billingStatus(a), { headers: privateHeaders });
  } catch (e) {
    return billingFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests(`test-billing-create:${a.id}`, 10);
    const v = z
      .object({ action: z.enum(["CREATE", "RECONCILE"]), input: z.unknown() })
      .strict()
      .parse(await jsonBody(req, 4000));
    return Response.json(
      await (v.action === "CREATE"
        ? createTestCheckout(a, v.input)
        : reconcileTestCheckout(a, v.input)),
      { headers: privateHeaders },
    );
  } catch (e) {
    return billingFailure(e);
  }
}
