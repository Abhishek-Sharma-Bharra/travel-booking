import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportingWindow,
  startOfLocalDay,
  fullCalendarMonths,
  calendarDate,
} from "../src/lib/reporting-time";
import { buildMetrics } from "../src/lib/kpi-service";
import { redactFinancial } from "../src/lib/financial-redaction";
test("reporting boundaries use India midnight and DST-aware 23/25-hour days", () => {
  assert.equal(
    startOfLocalDay("2026-11-10", "Asia/Kolkata").toISOString(),
    "2026-11-09T18:30:00.000Z",
  );
  const spring = reportingWindow(
      "2026-03-08",
      "2026-03-08",
      "America/New_York",
    ),
    fall = reportingWindow("2026-11-01", "2026-11-01", "America/New_York");
  assert.equal((+spring.end - +spring.start) / 3600000, 23);
  assert.equal((+fall.end - +fall.start) / 3600000, 25);
  assert.equal(
    calendarDate(new Date("2026-11-09T19:00:00Z"), "Asia/Kolkata"),
    "2026-11-10",
  );
  assert.equal(fullCalendarMonths("2024-02-01", "2024-02-29"), true);
  assert.equal(fullCalendarMonths("2024-02-02", "2024-02-29"), false);
  assert.throws(() =>
    reportingWindow("2026-02-30", "2026-03-02", "Asia/Kolkata"),
  );
  assert.throws(() =>
    reportingWindow("2026-11-10", "2026-11-01", "Asia/Kolkata"),
  );
});
test("unknown verification, missing costs, zero denominators and role restrictions remain explicit", () => {
  const metrics = buildMetrics(
    { leads: 0, bookings: 1, sales: 10000, costs: 0, incomplete: 1 },
    true,
    false,
    "No complete spend",
  );
  for (const key of [
    "conversion",
    "contribution",
    "margin",
    "verified",
    "profit",
    "recognized",
    "advertising",
    "cpl",
  ])
    assert.equal(metrics.find((m) => m.key === key)!.value, null, key);
  assert.equal(metrics.find((m) => m.key === "receipts")!.value, 0);
  const agent = buildMetrics(
    {
      leads: 1,
      bookings: 1,
      sales: 10000,
      costs: 6789,
      adSpend: 4567,
      incomplete: 0,
    },
    false,
    true,
    "",
  );
  for (const key of [
    "costs",
    "contribution",
    "margin",
    "advertising",
    "recordedAds",
    "cpl",
    "cac",
  ])
    assert.equal(agent.find((m) => m.key === key)!.value, null);
  assert.ok(!JSON.stringify(agent).includes("6789"));
  assert.ok(!JSON.stringify(agent).includes("4567"));
  const payload = redactFinancial({
    packages: [{ estimatedCost: 6789, rateNotes: "secret", price: 10000 }],
    bookings: [
      {
        quote: { estimatedCost: 6789, package: { estimatedCost: 6789 } },
        transactions: [
          { kind: "Receipt", amount: 100 },
          { kind: "Expense", amount: 6789 },
        ],
      },
    ],
    activities: [
      { action: "Expense recorded: 6789" },
      { action: "Enquiry created" },
    ],
  });
  assert.ok(!JSON.stringify(payload).includes("6789"));
  assert.ok(!JSON.stringify(payload).includes("secret"));
  assert.equal(payload.bookings[0].transactions.length, 1);
});
