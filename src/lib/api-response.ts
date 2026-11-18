/** Fail closed on an HTML proxy/Cloudflare page; never expose its raw body. */
export async function readApiJson<T>(response: Response): Promise<T> {
  const reference = response.headers.get("x-travelos-request-id");
  const suffix =
    reference && /^[a-z0-9-]{1,64}$/i.test(reference)
      ? ` Reference: ${reference}`
      : "";
  const invalid = () =>
    new Error(
      "The server returned an unexpected response. The request result is not confirmed; check your records before retrying." +
        suffix,
    );
  if (
    !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw invalid();
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw invalid();
  }
  if (!response.ok) {
    const message =
      value &&
      typeof value === "object" &&
      "error" in value &&
      typeof value.error === "string"
        ? value.error
        : undefined;
    throw new Error(
      message ||
        (response.status === 401
          ? "Your session expired. Please sign in again."
          : "The request could not be completed. Check your records before retrying." +
            suffix),
    );
  }
  return value as T;
}
