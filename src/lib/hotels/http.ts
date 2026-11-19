import { ZodError } from "zod";
import { auth } from "../auth";
import { HttpError, errorResponse, privateHeaders } from "../http";
import { hotelValidationMessage } from "./validation";
export async function hotelSession(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) throw new HttpError(401, "Please sign in");
  return s;
}
export function hotelError(e: unknown) {
  if (e instanceof HttpError) return errorResponse(e);
  if (e instanceof ZodError)
    return Response.json(
      { error: hotelValidationMessage(e) },
      { status: 400, headers: privateHeaders },
    );
  const code = (e as { code?: string })?.code;
  if (code === "P2002")
    return errorResponse(
      new HttpError(409, "A room category with that name already exists"),
    );
  if (code === "P2034")
    return errorResponse(
      new HttpError(409, "Another update occurred. Refresh and retry"),
    );
  console.error("Hotel operation failed", { code: code || "UNEXPECTED" });
  return errorResponse(
    new HttpError(
      503,
      "Hotel service unavailable. Please retry or contact support",
    ),
  );
}
