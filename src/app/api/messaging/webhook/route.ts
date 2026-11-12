import { timingSafeEqual } from "node:crypto";
import { limitedBody, errorResponse } from "@/lib/http";
import { receiveWhatsAppEvents } from "@/lib/messaging/webhook";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams,
    expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
    supplied = q.get("hub.verify_token") || "",
    challenge = q.get("hub.challenge") || "";
  const ok =
    expected.length >= 32 &&
    Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
  if (q.get("hub.mode") !== "subscribe" || !ok || challenge.length > 500)
    return new Response("Verification denied", { status: 403 });
  return new Response(challenge, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function POST(req: Request) {
  try {
    return Response.json(
      await receiveWhatsAppEvents(
        await limitedBody(req, 262144),
        req.headers.get("x-hub-signature-256"),
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
