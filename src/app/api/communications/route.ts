import { actor } from "@/lib/session";
import { z } from "zod";
import {
  jsonBody,
  sameOrigin,
  privateHeaders,
  errorResponse,
  HttpError,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import {
  connectNativeWhatsApp,
  nativeTemplates,
  consentNative,
  previewNative,
  sendNative,
  nativeWhatsAppOverview,
} from "@/lib/messaging/native-d1";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
  return errorResponse(
    e instanceof HttpError
      ? e
      : new HttpError(
          400,
          "Review the messaging request and provider configuration. No delivery is confirmed.",
        ),
  );
}
export async function GET() {
  try {
    return Response.json(await nativeWhatsAppOverview(await actor()), {
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
    await limitRequests(`native-messaging:${a.id}`, 15);
    const v = z
      .object({
        action: z.enum(["CONNECT", "TEMPLATES", "CONSENT", "PREVIEW", "SEND"]),
        input: z.unknown().optional(),
      })
      .strict()
      .parse(await jsonBody(req, 10000));
    let out: unknown;
    if (v.action === "CONNECT") out = await connectNativeWhatsApp(a, v.input);
    else if (v.action === "TEMPLATES")
      out = { templates: await nativeTemplates(a) };
    else if (v.action === "CONSENT") out = await consentNative(a, v.input);
    else if (v.action === "PREVIEW") {
      const p = await previewNative(a, v.input);
      out = { text: p.text, phone: p.phone, purpose: p.purpose };
    } else out = await sendNative(a, v.input);
    return Response.json(out, { headers: privateHeaders });
  } catch (e) {
    return fail(e);
  }
}
