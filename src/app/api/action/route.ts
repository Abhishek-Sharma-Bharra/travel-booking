import { actor } from "@/lib/session";
import { mutate } from "@/lib/actions";
import { ZodError } from "zod";
export async function POST(req: Request) {
  // Reject cross-origin writes even when an authenticated cookie is present.
  if (
    req.headers.get("origin") !==
    new URL(
      process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || req.url,
    ).origin
  )
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    const a = await actor();
    const body = await req.json();
    return Response.json(await mutate(a, body.action, body.input));
  } catch (e) {
    const error =
      e instanceof ZodError
        ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : (e as Error).message;
    const safe =
      (e as { code?: string }).code === "P2002"
        ? "A record with that ID already exists. No rows were imported."
        : (e as { code?: string }).code === "P2034"
          ? "Another update occurred. Refresh and try again."
          : (e as Error).name?.startsWith("Prisma")
            ? "The database could not save this record. Refresh and try again."
            : error;
    console.error(
      "Action failed:",
      e instanceof ZodError ? "Validation error" : (e as Error).name,
    );
    return Response.json(
      { error: safe },
      { status: error === "Please sign in" ? 401 : 400 },
    );
  }
}
