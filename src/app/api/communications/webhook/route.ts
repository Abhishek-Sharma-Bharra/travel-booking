import { createHash, timingSafeEqual } from "node:crypto";
import { nativeWhatsAppWebhook } from "@/lib/messaging/native-d1";
import {
  limitedBody,
  privateHeaders,
  errorResponse,
  HttpError,
} from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams,
    t = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
    provided = q.get("hub.verify_token") || "";
  if (
    !t ||
    q.get("hub.mode") !== "subscribe" ||
    !timingSafeEqual(
      createHash("sha256").update(t).digest(),
      createHash("sha256").update(provided).digest(),
    )
  )
    return new Response("Not authorised", {
      status: 403,
      headers: privateHeaders,
    });
  const challenge = q.get("hub.challenge") || "";
  if (!/^\d{1,100}$/.test(challenge))
    return new Response("Invalid challenge", {
      status: 400,
      headers: privateHeaders,
    });
  return new Response(challenge, { headers: privateHeaders });
}
export async function POST(req: Request) {
  try {
    return Response.json(
      await nativeWhatsAppWebhook(
        await limitedBody(req, 100000),
        req.headers.get("x-hub-signature-256") || "",
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(
      e instanceof HttpError
        ? e
        : new HttpError(400, "Invalid messaging callback"),
    );
  }
}
