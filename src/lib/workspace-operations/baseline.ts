export type DailyObservation = { day: string; count: number };
export function seasonalBaseline(
  events: DailyObservation[],
  asOf: string,
  coverageStart: string,
  complete = true,
) {
  const dayMs = 86400000,
    shift = (d: string, n: number) =>
      new Date(Date.parse(d + "T00:00:00Z") + n * dayMs)
        .toISOString()
        .slice(0, 10),
    weekday = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
  const valid = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  if (!valid(asOf) || !valid(coverageStart))
    return {
      available: false as const,
      reason: "No reliable recording window is available.",
    };
  const historyDays =
    Math.floor((Date.parse(asOf) - Date.parse(coverageStart)) / dayMs) + 1;
  const series = new Map<string, number>();
  for (const e of events) {
    if (
      valid(e.day) &&
      e.day >= coverageStart &&
      e.day <= asOf &&
      Number.isFinite(e.count) &&
      e.count >= 0
    )
      series.set(e.day, (series.get(e.day) ?? 0) + e.count);
  }
  const total = [...series.values()].reduce((n, v) => n + v, 0);
  if (!complete)
    return {
      available: false as const,
      reason:
        "The loaded history is incomplete. A forecast would be misleading.",
    };
  if (historyDays < 56 || total < 10)
    return {
      available: false as const,
      reason:
        "At least 56 recorded days and 10 events are needed for this planning baseline.",
      historyDays,
      events: total,
    };
  const samples = (origin: string, dow: number) =>
    Array.from({ length: 56 }, (_, i) => shift(origin, -i))
      .filter((d) => weekday(d) === dow)
      .map((d) => series.get(d) ?? 0);
  const mean = (v: number[]) => v.reduce((n, x) => n + x, 0) / v.length;
  const forecasts = [7, 30, 90].map((horizon) => {
    let expected = 0,
      lower = 0,
      upper = 0;
    for (let i = 1; i <= horizon; i++) {
      const v = samples(asOf, weekday(shift(asOf, i)));
      expected += mean(v);
      lower += Math.min(...v);
      upper += Math.max(...v);
    }
    return {
      horizon,
      expected: Math.round(expected),
      lower: Math.floor(lower),
      upper: Math.ceil(upper),
    };
  });
  const errors: number[] = [];
  if (historyDays >= 70) {
    for (let i = 13; i >= 0; i--) {
      const test = shift(asOf, -i),
        prediction = mean(samples(shift(test, -1), weekday(test)));
      errors.push(Math.abs((series.get(test) ?? 0) - prediction));
    }
  }
  return {
    available: true as const,
    version: "seasonal-naive-recorded-events-v1",
    asOf,
    historyDays,
    events: total,
    forecasts,
    oneDayMae: errors.length ? Number(mean(errors).toFixed(2)) : null,
    evaluationDays: errors.length,
    method:
      "Weekday average over the previous 8 weeks. Range spans observed weekday minima/maxima; it is not a calibrated probability interval. One-day retrospective MAE does not validate 30/90-day accuracy.",
  };
}
