import { actor } from "@/lib/session";
import { finishAuthorization } from "@/lib/integrations/service";
import { trustedOrigin } from "@/lib/http";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const q = new URL(req.url).searchParams;
  try {
    if (q.has("error")) throw Error();
    await finishAuthorization(
      await actor(),
      (await params).provider.toUpperCase(),
      q.get("state") || "",
      q.get("code") || "",
    );
    return Response.redirect(
      trustedOrigin() + "/workspace?integration=connected",
      303,
    );
  } catch {
    return Response.redirect(
      trustedOrigin() + "/workspace?integration=authorization-failed",
      303,
    );
  }
}
