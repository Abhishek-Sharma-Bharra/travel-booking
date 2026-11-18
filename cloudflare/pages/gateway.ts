interface Binding {
  fetch(request: Request): Promise<Response>;
}
interface Environment {
  ASSETS: Binding;
  TRAVELOS_BACKEND: Binding;
  PUBLIC_ORIGIN: string;
}
export default {
  async fetch(request: Request, env: Environment) {
    const url = new URL(request.url);
    if (url.origin !== env.PUBLIC_ORIGIN)
      return new Response("Unknown frontend origin", { status: 421 });
    const path = url.pathname;
    if (path.startsWith("/_next/static/")) return env.ASSETS.fetch(request);
    const headersToBackend = new Headers(request.headers);
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (url.protocol === "https:" && clientIp) {
      headersToBackend.set("X-Forwarded-For", clientIp);
      headersToBackend.set("X-Real-IP", clientIp);
    }
    // Only these CRM endpoints have a JSON-only contract. Auth callbacks and
    // streamed pages must keep their redirects and original response bodies.
    const crmApi = path === "/api/action" || path === "/api/data";
    const requestId = crmApi ? crypto.randomUUID() : undefined;
    const unavailable = (code: string, upstreamStatus?: number) => {
      console.error("CRM_API_UPSTREAM_FAILURE", {
        requestId,
        path,
        code,
        upstreamStatus,
      });
      return Response.json(
        {
          error:
            "The booking workspace could not reach its backend. The request result is not confirmed. Check your records before retrying. Reference: " +
            requestId,
          code,
          requestId,
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "X-TravelOS-Request-ID": requestId!,
          },
        },
      );
    };
    let response: Response;
    try {
      response = await env.TRAVELOS_BACKEND.fetch(
        new Request(request, { headers: headersToBackend }),
      );
    } catch (error) {
      if (!crmApi) throw error;
      return unavailable("BACKEND_UNAVAILABLE");
    }
    if (
      crmApi &&
      !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(
        response.headers.get("Content-Type") || "",
      )
    ) {
      await response.body?.cancel().catch(() => undefined);
      return unavailable("BACKEND_NON_JSON_RESPONSE", response.status);
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    if (requestId) headers.set("X-TravelOS-Request-ID", requestId);
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
