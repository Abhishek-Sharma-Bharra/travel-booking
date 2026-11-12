import { actor } from "@/lib/session";
import {
  integrationOverview,
  integrationActor,
  selectAdAccount,
  disconnectAdAccount,
  syncAds,
  authorizedAccounts,
} from "@/lib/integrations/service";
import {
  jsonBody,
  sameOrigin,
  privateHeaders,
  errorResponse,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { z } from "zod";
export async function GET() {
  try {
    const a = await actor();
    await limitRequests(`connections:${a.id}`, 30);
    return Response.json(await integrationOverview(a), {
      headers: privateHeaders,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const sessionActor = await actor();
    await limitRequests(`connections-write:${sessionActor.id}`, 10);
    const v = z
      .object({
        action: z.enum(["select", "disconnect", "sync", "accounts"]),
        id: z.string().min(1).max(100),
        accountId: z.string().max(100).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(await jsonBody(req, 10000));
    const a = await integrationActor(
      sessionActor,
      true,
      v.action === "disconnect",
    );
    const result =
      v.action === "accounts"
        ? await authorizedAccounts(a, v.id)
        : v.action === "select"
          ? await selectAdAccount(a, v.id, v.accountId || "")
          : v.action === "disconnect"
            ? await disconnectAdAccount(a, v.id)
            : await syncAds(a.agencyId, v.id, v.from || "", v.to || "");
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return errorResponse(e);
  }
}
