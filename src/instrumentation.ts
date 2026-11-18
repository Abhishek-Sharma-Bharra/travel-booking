import type { Instrumentation } from "next";
import { logRuntimeFailure } from "./lib/runtime-failure";
export const onRequestError: Instrumentation.onRequestError = (
  error,
  _request,
  context,
) => {
  const digest =
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(error.digest)
      ? error.digest
      : crypto.randomUUID();
  logRuntimeFailure("NEXT_REQUEST_FAILED", digest, error);
  // Route template, not the URL/query, so tokens and customer identifiers stay out.
  console.error("NEXT_ERROR_CONTEXT", {
    requestId: digest,
    route: context.routePath,
    type: context.routeType,
  });
};
