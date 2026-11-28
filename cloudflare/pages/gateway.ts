import {
  logRuntimeFailure,
  runtimeUnavailable,
} from "../../src/lib/runtime-failure";
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
    if (path.startsWith("/_next/static/") || path.startsWith("/images/")) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404 || !path.startsWith("/_next/static/"))
        return asset;
      // Pages and the backend build independently. During rollout, SSR can
      // reference the other build's hashed chunks; ask that worker's assets.
      try {
        return await env.TRAVELOS_BACKEND.fetch(request);
      } catch (error) {
        const id = crypto.randomUUID();
        logRuntimeFailure("STATIC_ASSET_BACKEND_FAILED", id, error);
        return new Response("Asset temporarily unavailable", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    const headersToBackend = new Headers(request.headers);
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (url.protocol === "https:" && clientIp) {
      headersToBackend.set("X-Forwarded-For", clientIp);
      headersToBackend.set("X-Real-IP", clientIp);
    }
    // Application APIs are JSON-only. Keep OAuth/auth redirects and webhook
    // challenge responses untouched; they legitimately return other formats.
    const applicationJsonApi =
      /^\/api\/(?:action|data|hotelier|admin|public|analytics|assistant|automation|tour|campaigns|invitations|health|payments|marketplace|workspace|billing|suppliers|commerce|customer|communications)(?:\/|$)/.test(
        path,
      ) ||
      path === "/api/messaging" ||
      path === "/api/integrations";
    const jsonApi = applicationJsonApi && !(path === "/api/communications/webhook" && request.method === "GET");
    const requestId = crypto.randomUUID();
    // Overwrite client-supplied IDs so the same support reference can be
    // followed through Pages, the backend Worker and Next's error handler.
    headersToBackend.set("X-TravelOS-Request-ID", requestId);
    const unavailable = (code: string, upstreamStatus?: number) => {
      console.error("APP_API_UPSTREAM_FAILURE", {
        requestId,
        path,
        code,
        upstreamStatus,
      });
      return Response.json(
        {
          error:
            "The workspace could not reach its backend. The request result is not confirmed. Check your records before retrying. Reference: " +
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
      logRuntimeFailure("PAGES_BACKEND_FAILED", requestId, error);
      if (!jsonApi) return runtimeUnavailable(request, requestId);
      return unavailable("BACKEND_UNAVAILABLE");
    }
    if (response.status >= 500)
      console.error("PAGES_UPSTREAM_HTTP_FAILURE", {
        requestId,
        method: request.method,
        upstreamStatus: response.status,
      });
    if (
      jsonApi &&
      path !== "/api/marketplace/report" &&
      !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(
        response.headers.get("Content-Type") || "",
      )
    ) {
      await response.body?.cancel().catch(() => undefined);
      return unavailable("BACKEND_NON_JSON_RESPONSE", response.status);
    }
    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      path === "/api/marketplace/plans" && response.status === 200
        ? "public, max-age=60"
        : "private, no-store",
    );
    if (requestId) headers.set("X-TravelOS-Request-ID", requestId);
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
