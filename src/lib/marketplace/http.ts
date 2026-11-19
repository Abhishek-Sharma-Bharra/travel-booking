import { ZodError } from "zod";
import { HttpError, errorResponse } from "../http";
export function marketplaceError(error: unknown) {
  if (error instanceof HttpError) return errorResponse(error);
  if (error instanceof ZodError)
    return errorResponse(
      new HttpError(400, "Review the required fields, dates and amounts"),
    );
  console.error("MARKETPLACE_OPERATION_FAILED", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return errorResponse(
    new HttpError(
      503,
      "Marketplace temporarily unavailable. Check your records before retrying.",
    ),
  );
}
