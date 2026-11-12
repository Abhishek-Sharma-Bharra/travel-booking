export class ProviderError extends Error {
  constructor(public code: string) {
    super(`Integration request failed: ${code}`);
  }
}
export async function providerJson(
  url: string,
  init: RequestInit = {},
  transport: typeof fetch = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await transport(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new ProviderError("NETWORK");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError("INVALID_RESPONSE");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 2000000) throw new ProviderError("RESPONSE_TOO_LARGE");
      chunks.push(chunk.value);
    }
  } catch {
    await reader.cancel();
    throw new ProviderError("INVALID_RESPONSE");
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let n = 0;
  for (const c of chunks) {
    data.set(c, n);
    n += c.length;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new ProviderError(
      response.ok ? "INVALID_RESPONSE" : "PROVIDER_UNAVAILABLE",
    );
  }
  if (!response.ok) {
    const e = (body as { error?: { code?: number; status?: string } }).error;
    throw new ProviderError(
      response.status === 401 ||
        (body as { error?: unknown }).error === "invalid_grant" ||
        [190, 102].includes(e?.code || 0) ||
        e?.status === "UNAUTHENTICATED"
        ? "NEEDS_REAUTH"
        : response.status === 403 ||
            [10, 200].includes(e?.code || 0) ||
            e?.status === "PERMISSION_DENIED"
          ? "PERMISSION"
          : response.status === 429 ||
              [4, 17, 613].includes(e?.code || 0) ||
              e?.status === "RESOURCE_EXHAUSTED"
            ? "RATE_LIMIT"
            : response.status >= 500
              ? "PROVIDER_UNAVAILABLE"
              : "INVALID_REQUEST",
    );
  }
  return body;
}
export function decimalMicros(s: string) {
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(s))
    throw new ProviderError("INVALID_AMOUNT");
  const [whole, fraction = ""] = s.split(".");
  return (
    BigInt(whole) * 1000000n +
    BigInt(fraction.padEnd(6, "0"))
  ).toString();
}
