import { ZodError } from "zod";
import { HttpError, errorResponse } from "../http";
export function billingFailure(e: unknown) {
  if (e instanceof HttpError) return errorResponse(e);
  if (e instanceof Error && e.message === "Please sign in")
    return errorResponse(e);
  if (e instanceof ZodError)
    return errorResponse(
      new HttpError(
        400,
        "Review the sandbox plan, quote version and test billing request",
      ),
    );
  console.error("SAAS_TEST_BILLING_UNAVAILABLE");
  return errorResponse(
    new HttpError(
      503,
      "Test billing could not be confirmed. Review the recorded checkout before retrying; no production access was changed.",
    ),
  );
}
