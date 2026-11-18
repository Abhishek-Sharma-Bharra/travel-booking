/** Public errors contain no exception messages, URLs, customer data or credentials. */
export function logRuntimeFailure(
  code: string,
  requestId: string,
  error: unknown,
) {
  console.error(code, {
    requestId,
    name: error instanceof Error ? error.name : "UnknownError",
    // Skip the message, which can contain SQL parameters or provider credentials.
    frames:
      error instanceof Error
        ? error.stack
            ?.split("\n")
            .slice(1, 5)
            .filter((line) => /^\s+at /.test(line))
            .map((line) => line.replace(/https?:\/\/[^\s)]+/g, "[source]"))
        : undefined,
  });
}
export function runtimeUnavailable(request: Request, requestId: string) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-TravelOS-Request-ID": requestId,
    "Retry-After": "10",
  };
  const message =
    "The service is temporarily unavailable. If you were saving or paying, check your records before trying again.";
  if (new URL(request.url).pathname.startsWith("/api/"))
    return Response.json(
      { error: message, code: "BACKEND_UNAVAILABLE", requestId },
      { status: 503, headers },
    );
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vashisht TravelOS · Please try again</title><body style="font:16px/1.7 system-ui,sans-serif;background:#f5f8fb;color:#21344a;margin:0;padding:10vh 7vw"><main style="max-width:640px;margin:auto"><p>VASHISHT TRAVELOS</p><h1>We couldn’t load this page.</h1><p>${message}</p><p>Wait a moment, then reload this page.</p><a href="/" style="color:#086580">Back to home</a><p style="font-size:12px">Support reference: ${requestId}</p></main></body></html>`,
    {
      status: 503,
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
