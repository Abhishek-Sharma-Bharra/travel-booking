import { createHash } from "node:crypto";
import { z } from "zod";
import { getPublicCampaign, submitRequest } from "@/lib/campaigns/service";
import { campaignReply } from "@/lib/campaigns/agent";
import {
  sameOrigin,
  jsonBody,
  errorResponse,
  privateHeaders,
  HttpError,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    sameOrigin(req);
    const { slug } = await params;
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const key = createHash("sha256").update(ip).digest("hex");
    await limitRequests(`public-trip-ip:${key}`, 20, 60);
    const v = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("chat"), input: z.unknown() }),
        z.object({ action: z.literal("request"), input: z.unknown() }),
      ])
      .parse(await jsonBody(req, 12000));
    if (v.action === "request") {
      await limitRequests(`public-trip-cap:${slug}`, 200, 86400);
      await limitRequests("public-trip-platform", 2000, 86400);
      await limitRequests(`public-trip-submit:${key}`, 10, 3600);
      return Response.json(await submitRequest(slug, v.input), {
        headers: privateHeaders,
      });
    }
    const campaign = await getPublicCampaign(slug);
    if (
      /passport|aadhaar|aadhar|credit card|debit card|cvv|bank account/i.test(
        JSON.stringify(v.input),
      )
    )
      throw new HttpError(
        400,
        "Do not send identity documents, card details or banking information in chat.",
      );
    const { chatSchema } = await import("@/lib/campaigns/contracts");
    const input = chatSchema.parse(v.input);
    if (input.aiConsent && campaign.aiAvailable) {
      await limitRequests(`campaign-ai-ip:${key}`, 20, 3600);
      await limitRequests(`campaign-ai:${slug}`, 100, 86400);
      await limitRequests("campaign-ai-platform", 1000, 86400);
    }
    return Response.json(await campaignReply(campaign, input), {
      headers: privateHeaders,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
