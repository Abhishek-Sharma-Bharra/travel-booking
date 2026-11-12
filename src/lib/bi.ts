import { z } from "zod";
import type { KpiData, Metric } from "./kpi-service";
import { shiftDay } from "./reporting-time";
import { inr } from "./money";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !isNaN(+new Date(v)) && new Date(v).toISOString().slice(0, 10) === v,
  );
export const biQuerySchema = z
  .object({
    from: date,
    to: date,
    destination: z.string().max(100),
    source: z.string().max(100),
    agent: z.string().max(100),
    package: z.string().max(100),
    grain: z.enum(["day", "week", "month"]),
    breakdown: z.enum(["destination", "agent", "source", "package"]),
    page: z.string().regex(/^\d{1,5}$/),
  })
  .refine(
    (q) => {
      const days = (+new Date(q.to) - +new Date(q.from)) / 86400000 + 1;
      return days >= 1 && days <= 366;
    },
    { message: "Choose 1–366 calendar days" },
  );
export type BiQuery = z.infer<typeof biQuerySchema>;
export const cardOptions = [
  "leads",
  "qualified",
  "conversion",
  "confirmed",
  "completed",
  "cancellations",
  "gbv",
  "sales",
  "receipts",
  "refunds",
  "netCash",
  "outstanding",
  "verified",
  "advertising",
  "cpl",
  "cac",
  "costs",
  "contribution",
  "margin",
  "recognized",
  "profit",
] as const;
export const columnOptions = [
  "leads",
  "bookings",
  "conversion",
  "gbv",
  "recordedCosts",
  "contribution",
  "margin",
] as const;
export type BiColumn = (typeof columnOptions)[number];
export type BiTrend = "leads" | "gbv" | "receipts" | "refunds";
export const viewSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  query: biQuerySchema,
  cards: z.array(z.enum(cardOptions)).min(1).max(8),
  columns: z.array(z.enum(columnOptions)).min(1).max(7),
  trend: z.enum(["leads", "gbv", "receipts", "refunds"]),
  chart: z.enum(["bar", "line"]),
});
export type BiView = z.infer<typeof viewSchema>;
export const restrictedKeys = new Set<string>([
  "costs",
  "recordedCosts",
  "contribution",
  "margin",
  "advertising",
  "cpl",
  "cac",
  "profit",
]);
export function readBiViews(raw: string | null): BiView[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 100) return [];
    return value
      .flatMap((x) => {
        const v = viewSchema.safeParse(x);
        return v.success ? [v.data] : [];
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}
export function biStorageKey(agencyId: string, userId: string) {
  return `travelos:bi:v1:${encodeURIComponent(agencyId)}:${encodeURIComponent(userId)}`;
}
export function formatBiValue(
  value: number | null | undefined,
  format: Metric["format"],
) {
  return value == null
    ? "Data unavailable"
    : format === "money"
      ? inr(value)
      : format === "percent"
        ? (value * 100).toFixed(1) + "%"
        : value.toLocaleString("en-IN");
}
export function metricChange(current: Metric, previous: Metric | undefined) {
  if (current.value === null || !previous || previous.value === null)
    return "Comparison unavailable";
  const delta = current.value - previous.value;
  if (delta === 0) return "No change";
  if (current.format === "percent")
    return `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)} percentage points`;
  return `${delta > 0 ? "+" : ""}${formatBiValue(delta, current.format)}`;
}
export function drillWindow(
  period: { from: string; to: string },
  bucket: string,
  grain: BiQuery["grain"],
) {
  let last = bucket;
  if (grain === "week") last = shiftDay(bucket, 6);
  if (grain === "month") {
    const [year, month] = bucket.split("-").map(Number);
    last = shiftDay(
      new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
      -1,
    );
  }
  const from = bucket < period.from ? period.from : bucket,
    to = last > period.to ? period.to : last;
  if (from > to) throw Error("Selected bucket is outside this report");
  return { from, to };
}
export const columnLabels: Record<BiColumn, string> = {
  leads: "Leads",
  bookings: "Bookings created",
  conversion: "Cohort conversion",
  gbv: "Gross booking value",
  recordedCosts: "Recorded direct costs",
  contribution: "Contribution before tax reconciliation",
  margin: "Contribution margin",
};
export function columnFormat(key: BiColumn): Metric["format"] {
  return ["conversion", "margin"].includes(key)
    ? "percent"
    : ["gbv", "recordedCosts", "contribution"].includes(key)
      ? "money"
      : "count";
}
export function exportBiGroups(report: KpiData, columns: BiColumn[]) {
  return report.performance.map((row) => {
    const result: Record<string, unknown> = {
      from: report.period.from,
      to: report.period.to,
      timezone: report.timezone,
      asOf: report.asOf,
      groupBy: report.filters.breakdown,
      group: row.label,
      tablePage: report.filters.page + 1,
    };
    for (const key of columns) {
      if (!report.financial && restrictedKeys.has(key)) continue;
      result[key] = row[key] ?? "Data unavailable";
      result[`${key}Unit`] =
        columnFormat(key) === "money"
          ? "INR paise"
          : columnFormat(key) === "percent"
            ? "fraction"
            : "count";
    }
    return result;
  });
}
