import { cookies } from "next/headers";
import { limitRequests } from "@/lib/rate-limit";
import { z } from "zod";
import {
  sameOrigin,
  jsonBody,
  privateHeaders,
  errorResponse,
  HttpError,
} from "@/lib/http";
import {
  consumeInvitation,
  customerOverview,
  logoutCustomer,
  portalCookie,
} from "@/lib/commerce/portal";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
  return errorResponse(
    e instanceof z.ZodError
      ? new HttpError(401, "Invalid customer invitation")
      : e,
  );
}
export async function GET() {
  try {
    return Response.json(
      await customerOverview((await cookies()).get(portalCookie)?.value),
      { headers: { ...privateHeaders, "Referrer-Policy": "no-referrer" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await limitRequests(
      "customer-invite:" + (req.headers.get("cf-connecting-ip") || "unknown"),
      20,
    );
    const v = z
        .object({ token: z.string().max(100) })
        .strict()
        .parse(await jsonBody(req, 300)),
      token = await consumeInvitation(v.token);
    (await cookies()).set(portalCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/customer",
      maxAge: 86400,
    });
    return Response.json({ authenticated: true }, { headers: privateHeaders });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const jar = await cookies(),
      token = jar.get(portalCookie)?.value;
    if (token) await logoutCustomer(token);
    jar.set(portalCookie, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/customer",
      maxAge: 0,
    });
    return Response.json({ signedOut: true }, { headers: privateHeaders });
  } catch (e) {
    return fail(e);
  }
}
