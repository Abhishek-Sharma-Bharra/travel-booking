import { createHmac } from "node:crypto";
import { Unit, identity, effective } from "./core";
import { HttpError } from "../http";
import type { Booking, Business } from "./types";
// Domain-separated capability; never accept a secret, requester or hotel from the client.
export function hotelCapability(booking: Pick<Booking, "id" | "requesterId">) {
  const key = process.env.BETTER_AUTH_SECRET;
  if (!key || key.length < 32)
    throw new HttpError(503, "Secure hotel checkout is not configured");
  return createHmac("sha256", key)
    .update(
      "travelos.marketplace.hotel-capability.v1\0" +
        booking.id +
        "\0" +
        booking.requesterId,
    )
    .digest("base64url");
}
export async function hotelAccess(userId: string, bookingId: string) {
  const u = new Unit();
  const actor = await identity(u, userId, true);
  const b = await u.row<Booking>("MPBooking", bookingId);
  if (
    b.requesterId !== userId ||
    (b.agencyId !== null && b.agencyId !== actor.agencyId) ||
    !b.hotelStayId ||
    effective(b) !== "HELD"
  )
    throw new HttpError(
      404,
      "An active hotel hold belonging to your account is required",
    );
  const business = await u.row<Business>("MPBusiness", b.businessId);
  if (!business.hotelId) throw new HttpError(404, "Hotel unavailable");
  return {
    hotelId: business.hotelId,
    url: "/stays/" + encodeURIComponent(business.hotelId),
    secret: hotelCapability(b),
  };
}
