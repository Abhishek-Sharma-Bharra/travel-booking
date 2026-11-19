import { z } from "zod";
import { Unit, own, id, now } from "./core";
import { HttpError } from "../http";
import type { Vehicle } from "./types";
export async function vehicleCalendar(userId: string, input: unknown) {
  const v = z
    .object({
      businessId: id,
      vehicleId: id,
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    })
    .strict()
    .parse(input);
  const u = new Unit();
  await own(u, userId, v.businessId);
  const r = await u.row<Vehicle>("MPVehicle", v.vehicleId);
  if (r.businessId !== v.businessId)
    throw new HttpError(404, "Vehicle not found");
  const start = v.month + "-01",
    d = new Date(start + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  const end = d.toISOString().slice(0, 10);
  const result = await u.db.batch<Record<string, unknown>>([
    u.db
      .prepare(
        "SELECT id,start,end,status FROM MPBooking WHERE vehicleId=? AND start<? AND end>? AND (status IN('CONFIRMED','COMPLETED') OR (status='HELD' AND holdUntil>?)) ORDER BY start LIMIT 100",
      )
      .bind(r.id, end, start, now()),
    u.db
      .prepare(
        "SELECT start,end,reason FROM MPBlackout WHERE vehicleId=? AND start<? AND end>? ORDER BY start LIMIT 366",
      )
      .bind(r.id, end, start),
  ]);
  const days = [];
  for (let day = start; day < end;) {
    const booking = result[0].results.find(
        (b) => String(b.start) <= day && String(b.end) > day,
      ),
      block = result[1].results.find(
        (b) => String(b.start) <= day && String(b.end) > day,
      );
    days.push({
      day,
      status: booking
        ? String(booking.status)
        : block
          ? "BLOCKED"
          : r.active
            ? "AVAILABLE"
            : "PAUSED",
      bookingId: booking ? String(booking.id) : null,
      reason: block ? String(block.reason) : "",
    });
    day = new Date(Date.parse(day + "T00:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
  }
  return { vehicleId: r.id, month: v.month, days };
}
