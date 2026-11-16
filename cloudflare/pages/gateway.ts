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
    const response = await env.TRAVELOS_BACKEND.fetch(
      new Request(request, { headers: headersToBackend }),
    );
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
