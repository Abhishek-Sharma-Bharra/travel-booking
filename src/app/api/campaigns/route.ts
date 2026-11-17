import { z } from "zod";
import { actor } from "@/lib/session";
import {
  listCampaigns,
  publishCampaign,
  pauseCampaign,
} from "@/lib/campaigns/service";
import {
  sameOrigin,
  jsonBody,
  errorResponse,
  privateHeaders,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export async function GET() {
  try {
    const a = await actor();
    await limitRequests(`campaign-read:${a.id}`, 60);
    return Response.json(
      { campaigns: await listCampaigns(a) },
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests(`campaign-write:${a.id}`, 20);
    const v = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("publish"), input: z.unknown() }),
        z.object({ action: z.literal("pause"), id: z.string().max(100) }),
      ])
      .parse(await jsonBody(req, 5000));
    return Response.json(
      v.action === "publish"
        ? await publishCampaign(a, v.input)
        : await pauseCampaign(a, v.id),
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
