import { test } from "node:test";
import assert from "node:assert/strict";
import { paise, quoteTotal, balances } from "../src/lib/money";
import { dateValue, leadSchema, safeCsv, taxRate } from "../src/lib/validation";
import { predict, scoreLead } from "../src/lib/model";
import parity from "../ml/parity.json";
import { analyse, defaultFilters } from "../src/lib/analytics";
import type { Dataset } from "../src/lib/data";
test("decimal money parsing and exact discounted tax calculation", () => {
  assert.equal(paise("12345.67"), 1234567);
  assert.equal(paise("0.1"), 10);
  assert.throws(() => paise("1.005"));
  assert.throws(() => paise("-1"));
  assert.throws(() => paise("1e6"));
  assert.equal(quoteTotal(10001, 3, 1000, 1800), 34224);
  assert.throws(() => quoteTotal(100, 1, 101, 0));
});
test("receipts, refunds, supplier payments and cancellation do not double count costs", () => {
  const b = {
    total: 100000,
    cancellationFee: 0,
    status: "Confirmed",
    transactions: [
      { kind: "Receipt", amount: 30000 },
      { kind: "Receipt", amount: 20000 },
      { kind: "Refund", amount: 5000 },
      { kind: "Expense", amount: 60000 },
      { kind: "Supplier payment", amount: 25000 },
    ],
  };
  assert.deepEqual(balances(b), {
    sales: 100000,
    receipts: 50000,
    refunds: 5000,
    netCash: 45000,
    customerDue: 55000,
    refundable: 0,
    supplierCost: 60000,
    supplierPaid: 25000,
    supplierDue: 35000,
    contribution: 40000,
  });
  const cancelled = balances({
    ...b,
    status: "Cancelled",
    cancellationFee: 10000,
    transactions: [
      ...b.transactions,
      { kind: "Supplier credit", amount: 30000 },
    ],
  });
  assert.equal(cancelled.sales, 10000);
  assert.equal(cancelled.refundable, 35000);
  assert.equal(cancelled.contribution, -20000);
  assert.equal(cancelled.supplierDue, 5000);
});
test("calendar validation rejects impossible dates and exports neutralise spreadsheet formulas", () => {
  assert.equal(dateValue.safeParse("2026-02-30").success, false);
  assert.equal(dateValue.safeParse("2024-02-29").success, true);
  const csv = safeCsv([
    {
      name: ' =HYPERLINK("bad")',
      note: "@SUM(1)",
      phone: "+919999",
      safe: "two,columns",
    },
  ]);
  assert.ok(csv.includes("' =HYPERLINK"));
  assert.ok(csv.includes("'@SUM"));
  assert.ok(csv.includes("'+919999"));
  assert.ok(csv.includes('"two,columns"'));
});
test("all 80 exported coefficient predictions match held-out Python predictions", () => {
  assert.equal(parity.length, 80);
  for (const row of parity)
    assert.ok(Math.abs(predict(row.inputs) - row.probability) < 1e-12);
});
test("missing and unsupported scoring inputs remain not scored; version is recorded on success", () => {
  const l = {
    budget: 100000,
    quotedPrice: 100000,
    enquiryDate: new Date("2026-01-01"),
    travelStart: new Date("2026-02-01"),
    travellers: 2,
    firstResponseHours: 4,
    repeatCustomer: false,
    itineraryRequested: true,
  };
  assert.equal(scoreLead({ ...l, firstResponseHours: null }).score, null);
  assert.match(scoreLead({ ...l, travellers: 21 }).scoreReason, /travellers/);
  assert.ok(scoreLead(l).modelVersion);
  assert.ok(scoreLead(l).scoredAt);
  assert.throws(() => predict([1, 30, 2, 169, 0, 1]));
});
test("date filters separate enquiry cohort, booking creation and collection dates", () => {
  const d = {
    agency: {},
    users: [],
    packages: [],
    quotes: [],
    activities: [],
    spends: [
      {
        kind: "Advertising",
        channel: "Meta Ads",
        month: "2026-02",
        amount: 1000,
      },
    ],
    leads: [
      {
        id: "a",
        customer: "Example",
        externalId: "A",
        destination: "Bali",
        source: "Meta Ads",
        assignedId: "u",
        enquiryDate: "2026-01-31",
        stage: "Won",
        followUp: null,
      },
    ],
    bookings: [
      {
        id: "b",
        leadId: "a",
        createdAt: "2026-02-01",
        total: 10000,
        cancellationFee: 0,
        status: "Confirmed",
        quote: { packageId: "p" },
        transactions: [{ kind: "Receipt", amount: 5000, date: "2026-02-02" }],
      },
    ],
  } as unknown as Dataset;
  const f = { ...defaultFilters(), from: "2026-02-01", to: "2026-02-28" };
  const a = analyse(d, f);
  assert.equal(a.leads.length, 0);
  assert.equal(a.bookings.length, 1);
  assert.equal(a.collected, 5000);
  assert.equal(a.due, 5000);
  const sliced = analyse(d, { ...f, destination: "Bali" });
  assert.equal(sliced.sourceStats[0].roas, null);
});

test("missing ML response input is not silently coerced to zero", () => {
  const base = {
    externalId: "V1",
    customer: "Sample Traveller",
    destination: "Kerala",
    enquiryDate: "2026-01-01",
    travelStart: "2026-02-01",
    travelEnd: "2026-02-05",
    travellers: 2,
    budget: "20000",
    quotedPrice: "22000",
    source: "Website",
    assignedId: "user-1",
    stage: "New",
  };
  for (const value of [undefined, null, ""])
    assert.equal(
      leadSchema.parse({ ...base, firstResponseHours: value })
        .firstResponseHours,
      null,
    );
  assert.equal(
    leadSchema.safeParse({ ...base, firstResponseHours: false }).success,
    false,
  );
  assert.equal(
    leadSchema.safeParse({ ...base, firstResponseHours: " " }).success,
    false,
  );
  assert.equal(
    leadSchema.parse({ ...base, firstResponseHours: "0" }).firstResponseHours,
    0,
  );
});

test("fractional tax inputs use exact decimal parsing, not binary float rounding", () => {
  assert.equal(taxRate.parse("8.03"), 803);
  assert.equal(taxRate.parse(5), 500);
  assert.equal(quoteTotal(10000, 1, 0, taxRate.parse("8.03")), 10803);
  assert.equal(taxRate.safeParse("100.01").success, false);
  assert.equal(taxRate.safeParse("8.031").success, false);
});
