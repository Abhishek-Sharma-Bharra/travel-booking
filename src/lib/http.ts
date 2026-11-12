export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function limitedBody(
  req: Request,
  maxBytes = 1_500_000,
): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length")) > maxBytes)
    throw new HttpError(413, "Request is too large");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.length;
  }
  return body;
}
export async function jsonBody(
  req: Request,
  maxBytes = 1_500_000,
): Promise<unknown> {
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "Use a JSON request");
  try {
    return JSON.parse(
      new TextDecoder().decode(await limitedBody(req, maxBytes)),
    );
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Request contains invalid JSON");
  }
}
export function trustedOrigin() {
  const origin =
    process.env.BETTER_AUTH_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3000";
  return new URL(origin).origin;
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== trustedOrigin())
    throw new HttpError(403, "Invalid request origin");
}
export function errorResponse(e: unknown) {
  const error = e as Error & { code?: string };
  let status = e instanceof HttpError ? e.status : 400;
  const message =
    e instanceof HttpError
      ? e.message
      : error.code === "P2002"
        ? "A record with that ID already exists. No rows were imported."
        : error.code === "P2034"
          ? "Another update occurred. Refresh and try again."
          : error.name?.startsWith("Prisma")
            ? "The database could not save this record. Refresh and try again."
            : error.message === "Please sign in"
              ? "Please sign in"
              : error.message || "The request could not be completed";
  if (message === "Please sign in") status = 401;
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        ...privateHeaders,
        ...(e instanceof HttpError ? e.headers : {}),
      },
    },
  );
}
