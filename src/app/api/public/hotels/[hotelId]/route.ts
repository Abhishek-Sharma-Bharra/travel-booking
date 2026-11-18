import { cookies } from "next/headers";
import { z } from "zod";
import { jsonBody, sameOrigin, privateHeaders } from "@/lib/http";
import { limitRequests } from "@/lib/rate-limit";
import { hotelError } from "@/lib/hotels/http";
import {
  publicHotel,
  hotelQuote,
  holdHotelRoom,
  hotelStayStatus,
  cancelHotelHold,
} from "@/lib/hotels/booking";
import { hotelChat, hotelChatSnapshot } from "@/lib/hotels/agent";
import { createHotelOrder, verifyHotelCheckout } from "@/lib/hotels/payments";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  try {
    const { hotelId } = await params;
    const jar = await cookies(),
      secret = jar.get("hotel_guest_" + hotelId)?.value;
    if (new URL(req.url).searchParams.get("action") === "chat")
      return Response.json(await hotelChatSnapshot(hotelId, secret || ""), {
        headers: privateHeaders,
      });
    if (new URL(req.url).searchParams.get("action") === "status")
      return Response.json(await hotelStayStatus(hotelId, secret || ""), {
        headers: privateHeaders,
      });
    return Response.json(await publicHotel(hotelId), {
      headers: privateHeaders,
    });
  } catch (e) {
    return hotelError(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ hotelId: string }> },
) {
  try {
    sameOrigin(req);
    const { hotelId } = await params;
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    await limitRequests(`hotel-public:${hotelId}:${ip}`, 20);
    const body = z
      .object({
        action: z.enum(["chat", "quote", "hold", "cancel", "order", "verify"]),
        input: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(req, 12000));
    const jar = await cookies(),
      name = "hotel_guest_" + hotelId,
      secret = jar.get(name)?.value;
    if (body.action === "order")
      return Response.json(
        await createHotelOrder(hotelId, secret || "", body.input),
        { headers: privateHeaders },
      );
    if (body.action === "verify")
      return Response.json(
        await verifyHotelCheckout(hotelId, secret || "", body.input),
        { headers: privateHeaders },
      );
    if (body.action === "cancel")
      return Response.json(
        await cancelHotelHold(hotelId, secret || "", body.input),
        { headers: privateHeaders },
      );
    if (body.action === "quote")
      return Response.json(await hotelQuote(hotelId, body.input), {
        headers: privateHeaders,
      });
    const result =
      body.action === "chat"
        ? await hotelChat(hotelId, body.input, secret)
        : await holdHotelRoom(hotelId, body.input, secret);
    const { secret: cap, ...output } = result;
    jar.set(name, cap, {
      httpOnly: true,
      secure: new URL(req.url).protocol === "https:",
      sameSite: "lax",
      path: `/api/public/hotels/${hotelId}`,
      maxAge: 7 * 86400,
    });
    return Response.json(output, { headers: privateHeaders });
  } catch (e) {
    return hotelError(e);
  }
}
