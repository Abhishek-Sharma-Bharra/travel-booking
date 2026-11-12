import { test } from "node:test";
import assert from "node:assert/strict";
import {
  biStorageKey,
  readBiViews,
  viewSchema,
  drillWindow,
  metricChange,
  exportBiGroups,
} from "../src/lib/bi";
import type { KpiData, Metric } from "../src/lib/kpi-service";
import { safeCsv } from "../src/lib/validation";
const view = {
  id: "199b5ecb-dc85-43af-ab4d-f6e4448b2653",
  name: "Source performance",
  query: {
    from: "2026-01-03",
    to: "2026-02-02",
    destination: "",
    source: "",
    agent: "",
    package: "",
    grain: "week",
    breakdown: "source",
    page: "0",
  },
  cards: ["leads", "contribution"],
  columns: ["leads", "gbv", "recordedCosts"],
  trend: "leads",
  chart: "line",
};
test("BI saved views validate settings, bound storage, and keep account keys separate", () => {
  assert.equal(viewSchema.safeParse(view).success, true);
  assert.equal(readBiViews("broken JSON").length, 0);
  assert.equal(
    readBiViews(
      JSON.stringify([
        view,
        { ...view, query: { ...view.query, from: "2026-02-30" } },
      ]),
    ).length,
    1,
  );
  assert.equal(
    viewSchema.safeParse({
      ...view,
      query: { ...view.query, to: "2028-01-01" },
    }).success,
    false,
  );
  assert.equal(
    viewSchema.safeParse({ ...view, cards: ["unrestrictedSQL"] }).success,
    false,
  );
  const parsed = readBiViews(
    JSON.stringify([
      {
        ...view,
        results: [{ customer: "must not persist" }],
        query: { ...view.query, agencyId: "foreign" },
      },
    ]),
  )[0];
  assert.ok(!("results" in parsed));
  assert.ok(!("agencyId" in parsed.query));
  assert.equal(readBiViews(JSON.stringify(Array(13).fill(view))).length, 12);
  assert.notEqual(
    biStorageKey("agency:a", "user:b"),
    biStorageKey("agency", "a:user:b"),
  );
  assert.notEqual(biStorageKey("a", "u1"), biStorageKey("a", "u2"));
});
test("BI date drilling respects partial weeks, month ends and leap years", () => {
  assert.deepEqual(
    drillWindow({ from: "2026-01-03", to: "2026-02-02" }, "2025-12-29", "week"),
    { from: "2026-01-03", to: "2026-01-04" },
  );
  assert.deepEqual(
    drillWindow(
      { from: "2026-01-03", to: "2026-02-02" },
      "2026-02-01",
      "month",
    ),
    { from: "2026-02-01", to: "2026-02-02" },
  );
  assert.deepEqual(
    drillWindow(
      { from: "2024-02-01", to: "2024-03-05" },
      "2024-02-01",
      "month",
    ),
    { from: "2024-02-01", to: "2024-02-29" },
  );
  assert.throws(() =>
    drillWindow({ from: "2026-01-03", to: "2026-02-02" }, "2026-04-01", "day"),
  );
});
test("BI comparisons retain unavailable values and use percentage points for rates", () => {
  const metric = (
    value: number | null,
    format: Metric["format"] = "count",
  ): Metric => ({ key: "test", label: "Test", value, format, basis: "Test" });
  assert.equal(metricChange(metric(null), metric(0)), "Comparison unavailable");
  assert.equal(metricChange(metric(5), metric(0)), "+5");
  assert.equal(
    metricChange(metric(0.5, "percent"), metric(0.4, "percent")),
    "+10.0 percentage points",
  );
  assert.equal(metricChange(metric(0), metric(0)), "No change");
});
test("BI export strips restricted columns, preserves missing costs and guards CSV formulas", () => {
  const report = {
    financial: false,
    period: { from: "2026-01-01", to: "2026-01-31" },
    timezone: "Asia/Kolkata",
    asOf: "2026-02-01T00:00:00Z",
    filters: { breakdown: "source", page: 2 },
    performance: [
      {
        key: "a",
        label: "=HYPERLINK(fake)",
        leads: 2,
        gbv: 500000,
        recordedCosts: 123456,
        contribution: null,
        conversion: 0.5,
      },
    ],
  } as unknown as KpiData;
  const rows = exportBiGroups(report, [
    "leads",
    "gbv",
    "recordedCosts",
    "contribution",
  ]);
  assert.equal(rows[0].gbvUnit, "INR paise");
  assert.equal(rows[0].tablePage, 3);
  assert.ok(!("recordedCosts" in rows[0]));
  assert.ok(!("contribution" in rows[0]));
  assert.match(safeCsv(rows), /'=HYPERLINK/);
  const owner = exportBiGroups({ ...report, financial: true }, [
    "contribution",
  ]);
  assert.equal(owner[0].contribution, "Data unavailable");
});
