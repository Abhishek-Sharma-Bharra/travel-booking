import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { limitedBody, HttpError } from "@/lib/http";
import { requireMail, verificationRequired } from "@/lib/mail";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(req: Request) {
  try {
    const path = new URL(req.url).pathname;
    if (
      path.endsWith("/request-password-reset") ||
      path.endsWith("/send-verification-email") ||
      (path.endsWith("/sign-up/email") && verificationRequired())
    )
      requireMail();
    const bytes = await limitedBody(req, 65536);
    const forwarded = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: Buffer.from(bytes),
    });
    const response = await handlers.POST(forwarded);
    if (path.endsWith("/request-password-reset") && response.status >= 500) {
      console.warn("Password reset delivery unavailable");
      return Response.json(
        {
          status: true,
          message:
            "If the account exists and email delivery is available, you will receive a reset link.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return response;
  } catch (e) {
    return Response.json(
      {
        code: "AUTH_REQUEST_FAILED",
        message:
          e instanceof HttpError
            ? e.message
            : "Authentication request could not be completed",
      },
      {
        status: e instanceof HttpError ? e.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
