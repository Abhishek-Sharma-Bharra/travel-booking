import { z } from "zod";
import { scheduleManualNotification } from "@/lib/automation/service";
import { actor } from "@/lib/session";
import { integrationActor } from "@/lib/integrations/service";
import {
  messagingOverview,
  recordConsent,
  configureMessaging,
  syncTemplates,
  notificationPreview,
  purposes,
} from "@/lib/messaging/service";
import {
  jsonBody,
  sameOrigin,
  privateHeaders,
  errorResponse,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export async function GET() {
  try {
    const a = await actor();
    await limitRequests(`messaging-read:${a.id}`, 30);
    return Response.json(await messagingOverview(a), {
      headers: privateHeaders,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests(`messaging-write:${a.id}`, 20);
    const { action, input } = z
      .object({
        action: z.enum(["consent", "config", "templates", "preview", "queue"]),
        input: z.unknown(),
      })
      .parse(await jsonBody(req, 10000));
    let result;
    if (action === "consent") result = await recordConsent(a, input);
    else if (action === "config") result = await configureMessaging(a, input);
    else {
      await integrationActor(a, true);
      const v = z
        .object({
          id: z.string().max(100),
          purpose: z.enum(purposes).optional(),
        })
        .parse(input);
      if (action === "templates") result = await syncTemplates(a, v.id);
      else if (action === "queue")
        result = await scheduleManualNotification(
          a,
          v.id,
          v.purpose || "BOOKING_CONFIRMATION",
        );
      else {
        const p = await notificationPreview(
          a.agencyId,
          v.id,
          v.purpose || "BOOKING_CONFIRMATION",
        );
        result = {
          text: p.text,
          phone: p.phone,
          message: "Preview only. Nothing sent.",
        };
      }
    }
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return errorResponse(e);
  }
}
