import { seasonalBaseline } from "./baseline";
export type OccupancyDay = { day: string; allotment: number; booked: number };
/** Missing configured nights are unknown, never silently replaced with zero. */
export function occupancyPlanning(
  history: OccupancyDay[],
  future: { day: string; allotment: number }[],
  asOf: string,
) {
  const shift = (n: number) =>
    new Date(Date.parse(asOf + "T00:00:00Z") + n * 86400000)
      .toISOString()
      .slice(0, 10);
  const rows = new Map(history.map((r) => [r.day, r]));
  const complete = Array.from({ length: 70 }, (_, i) =>
    rows.get(shift(-i)),
  ).every(
    (r) =>
      r &&
      Number.isSafeInteger(r.allotment) &&
      r.allotment > 0 &&
      Number.isSafeInteger(r.booked) &&
      r.booked >= 0 &&
      r.booked <= r.allotment,
  );
  const base = seasonalBaseline(
    history.map((r) => ({ day: r.day, count: r.booked })),
    asOf,
    shift(-69),
    complete,
  );
  if (!base.available)
    return {
      ...base,
      reason: complete
        ? base.reason
        : "Occupancy planning needs 70 consecutive configured past nights with valid booked-room coverage. Missing dates and changed allotments are unknown.",
    };
  const capacity = new Map(future.map((r) => [r.day, r.allotment]));
  return {
    ...base,
    forecasts: base.forecasts.map((f) => {
      const nights = Array.from({ length: f.horizon }, (_, i) =>
        capacity.get(shift(i + 1)),
      );
      const known = nights.every(
        (n) => n !== undefined && Number.isSafeInteger(n) && n > 0,
      );
      const allotment = known
        ? nights.reduce<number>((n, v) => n + v!, 0)
        : null;
      return {
        ...f,
        allotment,
        estimatedOccupancyPercent: allotment
          ? Math.min(100, Math.round((f.expected / allotment) * 1000) / 10)
          : null,
      };
    }),
    basis:
      "Seasonal baseline of currently confirmed, provider-verified booked room nights. Percentages use explicitly configured future allotments and are capped at 100%; they are planning estimates, not guaranteed bookings, physical guest presence or available inventory. Missing future capacity has no percentage. No calibrated ML model is enabled.",
  };
}
