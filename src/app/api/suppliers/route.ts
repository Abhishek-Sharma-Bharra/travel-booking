import { z, ZodError } from "zod";
import { actor } from "@/lib/session";
import { supplierOverview, saveSupplier } from "@/lib/suppliers/service";
import {
  sameOrigin,
  jsonBody,
  privateHeaders,
  HttpError,
  errorResponse,
} from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof ZodError)
    return errorResponse(
      new HttpError(
        400,
        "Review supplier contact, contract dates, rate and required terms",
      ),
    );
  if (
    e instanceof HttpError ||
    (e instanceof Error && e.message === "Please sign in")
  )
    return errorResponse(e);
  if (["P2034", "P2002"].includes((e as { code?: string }).code || ""))
    return errorResponse(
      new HttpError(
        409,
        "Supplier changed during another update. Reload before retrying.",
      ),
    );
  console.error("SUPPLIER_DIRECTORY_UNAVAILABLE");
  return errorResponse(
    new HttpError(
      503,
      "Supplier service unavailable. Check saved records before retrying with the same request key.",
    ),
  );
}
export async function GET(req: Request) {
  try {
    const a = await actor();
    await limitRequests(`supplier-read:${a.id}`, 60);
    const q = z
      .object({
        id: z.uuid().optional(),
        page: z.coerce.number().int().min(0).max(100).default(0),
        search: z.string().max(100).default(""),
      })
      .strict()
      .parse(Object.fromEntries(new URL(req.url).searchParams));
    return Response.json(await supplierOverview(a, q), {
      headers: privateHeaders,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await actor();
    await limitRequests(`supplier-write:${a.id}`, 20);
    return Response.json(await saveSupplier(a, await jsonBody(req, 24000)), {
      headers: privateHeaders,
    });
  } catch (e) {
    return failure(e);
  }
}
