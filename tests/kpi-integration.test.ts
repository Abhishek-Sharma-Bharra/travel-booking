import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { kpiData } from "../src/lib/kpi-service";
import { mutate } from "../src/lib/actions";
import { workspaceData } from "../src/lib/data";
import type { Actor } from "../src/lib/access";
test("server KPIs preserve cohorts, timezone, payment provenance, cost coverage and tenant/field isolation", async () => {
  const key = "kpi-" + randomUUID(),
    ids = [key + "a", key + "b"];
  try {
    for (const id of ids) {
      await db.agency.create({
        data: { id, name: "KPI test", timezone: "Asia/Kolkata" },
      });
      await db.user.create({
        data: {
          id,
          name: "Owner",
          email: id + "@example.test",
          agencyId: id,
          role: "OWNER",
        },
      });
    }
    const a: Actor = { id: ids[0], agencyId: ids[0], role: "OWNER" },
      b: Actor = { id: ids[1], agencyId: ids[1], role: "OWNER" };
    const p = await db.package.create({
      data: {
        agencyId: a.agencyId,
        name: "KPI package",
        destination: "Bali",
        days: 5,
        price: 10000,
        estimatedCost: 6789,
        inclusions: "Hotel",
        exclusions: "Flight",
      },
    });
    const l = await db.lead.create({
      data: {
        agencyId: a.agencyId,
        externalId: key,
        customer: "KPI lead",
        destination: "Bali",
        source: "Website",
        assignedId: a.id,
        enquiryDate: new Date("2026-10-01"),
        travelStart: new Date("2027-01-01"),
        travelEnd: new Date("2027-01-05"),
        travellers: 2,
        budget: 10000,
        stage: "Qualified",
      },
    });
    await mutate(a, "quote", {
      leadId: l.id,
      packageId: p.id,
      tax: "0",
      discount: "0",
    });
    const q = await db.quote.findFirstOrThrow({ where: { leadId: l.id } });
    await mutate(a, "accept", { id: q.id, dueDate: "2026-10-31" });
    const booking = await db.booking.findFirstOrThrow({
      where: { leadId: l.id },
    });
    await db.booking.update({
      where: { id: booking.id },
      data: { createdAt: new Date("2026-10-05T12:00:00Z") },
    });
    await db.transaction.createMany({
      data: [
        {
          agencyId: a.agencyId,
          bookingId: booking.id,
          kind: "Receipt",
          amount: 5000,
          date: new Date("2026-09-30T18:30:00Z"),
          dateBasis: "INSTANT",
        },
        {
          agencyId: a.agencyId,
          bookingId: booking.id,
          kind: "Receipt",
          amount: 2000,
          date: new Date("2026-10-31T18:30:00Z"),
          dateBasis: "INSTANT",
        },
        {
          agencyId: a.agencyId,
          bookingId: booking.id,
          kind: "Expense",
          amount: 6789,
          date: new Date("2026-10-10"),
        },
      ],
    });
    const filters = { from: "2026-10-01", to: "2026-10-31" };
    const futureYear = new Date().getUTCFullYear() + 2;
    await assert.rejects(
      mutate(a, "ad-coverage", {
        from: `${futureYear}-01-01`,
        to: `${futureYear}-01-31`,
        source: "",
        complete: true,
        revision: 0,
      }),
      /closed historical/,
    );

    let report = await kpiData(a, filters);
    const get = (key: string) =>
      report.current.find((m) => m.key === key)!.value;
    assert.equal(get("leads"), 1);
    assert.equal(get("qualified"), 1);
    assert.equal(get("conversion"), 1);
    assert.equal(get("gbv"), 20000);
    assert.equal(get("receipts"), 5000);
    assert.equal(get("outstanding"), 13000);
    assert.equal(get("verified"), null);
    assert.equal(get("contribution"), null);
    assert.equal(get("profit"), null);
    assert.equal(
      report.trends.reduce((s, r) => s + r.receipts, 0),
      5000,
    );
    assert.equal(report.trends.length, 31);
    assert.equal(report.performance[0].gbv, 20000);
    assert.equal(report.period.endExclusive, "2026-10-31T18:30:00.000Z");
    await mutate(a, "cost-coverage", {
      id: booking.id,
      complete: true,
      revision: (
        await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
      ).costRevision,
    });
    report = await kpiData(a, filters);
    assert.equal(get("contribution"), 13211);
    assert.equal(get("margin"), 13211 / 20000);
    const beforeCostRevision = (
      await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    ).costRevision;
    await db.transaction.create({
      data: {
        agencyId: a.agencyId,
        bookingId: booking.id,
        kind: "Expense",
        amount: 1000,
        date: new Date("2026-10-12"),
      },
    });
    assert.equal(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } }))
        .directCostsComplete,
      false,
    );
    await assert.rejects(
      mutate(a, "cost-coverage", {
        id: booking.id,
        complete: true,
        revision: beforeCostRevision,
      }),
      /changed/,
    );
    report = await kpiData(a, filters);
    assert.equal(get("contribution"), null);

    await db.spend.create({
      data: {
        agencyId: a.agencyId,
        month: "2026-10",
        kind: "Advertising",
        channel: "Website",
        amount: 3000,
      },
    });
    await mutate(a, "ad-coverage", {
      ...filters,
      source: "Website",
      complete: true,
      revision: (
        await db.agency.findUniqueOrThrow({ where: { id: a.agencyId } })
      ).adSpendRevision,
    });
    report = await kpiData(a, { ...filters, source: "Website" });
    assert.equal(get("advertising"), 3000);
    assert.equal(get("cpl"), 3000);
    assert.equal(get("cac"), 3000);
    report = await kpiData(a, {
      from: "2026-10-02",
      to: "2026-10-31",
      source: "Website",
    });
    assert.equal(get("advertising"), null);
    await mutate(a, "spend", {
      month: "2026-10",
      kind: "Advertising",
      channel: "Website",
      amount: "40",
      memo: "",
    });
    report = await kpiData(a, { ...filters, source: "Website" });
    assert.equal(get("advertising"), null);
    await assert.rejects(
      kpiData(b, { ...filters, package: p.id }),
      /not found/,
    );
    assert.equal(
      (await kpiData(b, filters)).current.find((m) => m.key === "leads")!.value,
      0,
    );
    await assert.rejects(
      mutate(b, "cost-coverage", {
        id: booking.id,
        complete: true,
        revision: 0,
      }),
      /not found/,
    );
    await assert.rejects(
      kpiData(a, { ...filters, campaign: "fake" }),
      /unavailable/,
    );
    await assert.rejects(kpiData({ ...a, demo: true }, filters), /fictional/);
    await mutate(a, "booking", {
      id: booking.id,
      status: "Cancelled",
      supplierStatus: "Pending",
      cancellationFee: "10",
    });
    await db.transaction.create({
      data: {
        agencyId: a.agencyId,
        bookingId: booking.id,
        kind: "Refund",
        amount: 1000,
        date: new Date("2026-10-15"),
      },
    });
    report = await kpiData(a, filters);
    assert.equal(get("conversion"), 0);
    assert.equal(get("cancellations"), 1);
    assert.equal(get("gbv"), 20000);
    assert.equal(get("sales"), 1000);
    assert.equal(get("refunds"), 1000);
    assert.equal(get("netCash"), 4000);
    assert.equal(get("outstanding"), 0);
    await db.agency.update({
      where: { id: a.agencyId },
      data: { timezone: "America/New_York" },
    });
    report = await kpiData(a, filters);
    assert.equal(get("receipts"), 2000);
    await db.transaction.create({
      data: {
        agencyId: a.agencyId,
        bookingId: booking.id,
        kind: "Receipt",
        amount: 3000,
        date: new Date("2026-10-01T00:00:00Z"),
      },
    });
    report = await kpiData(a, filters);
    assert.equal(
      get("receipts"),
      5000,
      "Date-only Oct 1 remains Oct 1 even in New York",
    );

    assert.equal(report.period.start, "2026-10-01T04:00:00.000Z");
    assert.equal(report.period.endExclusive, "2026-11-01T04:00:00.000Z");
    await db.agency.update({
      where: { id: a.agencyId },
      data: { timezone: "Asia/Kolkata" },
    });
    await db.user.update({ where: { id: a.id }, data: { role: "AGENT" } });
    report = await kpiData(a, filters);
    assert.equal(report.financial, false);
    assert.equal(get("costs"), null);
    assert.equal(report.performance[0].recordedCosts, undefined);
    await assert.rejects(
      kpiData(a, { ...filters, agent: b.id }),
      /only assigned/,
    );
    await assert.rejects(
      mutate(a, "cost-coverage", {
        id: booking.id,
        complete: true,
        revision: 0,
      }),
      /permission/,
    );
    const agentData = await workspaceData({ ...a, role: "AGENT" });
    assert.ok(!JSON.stringify(agentData).includes("estimatedCost"));
    assert.equal(
      agentData.bookings[0].transactions.some((t) => t.kind === "Expense"),
      false,
    );
    await db.lead.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        agencyId: a.agencyId,
        externalId: `${key}-page-${i}`,
        customer: "Paged enquiry",
        destination: `Destination ${String(i).padStart(2, "0")}`,
        source: "Referral",
        assignedId: a.id,
        enquiryDate: new Date("2026-10-20"),
        travelStart: new Date("2027-01-01"),
        travelEnd: new Date("2027-01-05"),
        travellers: 2,
        budget: 1000,
      })),
    });
    const page0 = await kpiData(a, filters),
      page1 = await kpiData(a, { ...filters, page: 1 });
    assert.equal(page0.totalGroups, 22);
    assert.equal(page0.performance.length, 20);
    assert.equal(page1.performance.length, 2);
    assert.equal(
      new Set([...page0.performance, ...page1.performance].map((x) => x.key))
        .size,
      22,
    );
    await assert.rejects(
      mutate(a, "quote", {
        leadId: l.id,
        packageId: p.id,
        tax: "0",
        discount: "0",
        pricingMode: "Cost plus markup",
        pricingPercent: "20",
      }),
    );
  } finally {
    await db.reportingCoverage.deleteMany({ where: { agencyId: { in: ids } } });
    await db.activity.deleteMany({ where: { agencyId: { in: ids } } });
    await db.transaction.deleteMany({ where: { agencyId: { in: ids } } });
    await db.booking.deleteMany({ where: { agencyId: { in: ids } } });
    await db.quote.deleteMany({ where: { agencyId: { in: ids } } });
    await db.lead.deleteMany({ where: { agencyId: { in: ids } } });
    await db.package.deleteMany({ where: { agencyId: { in: ids } } });
    await db.spend.deleteMany({ where: { agencyId: { in: ids } } });
    await db.user.deleteMany({ where: { agencyId: { in: ids } } });
    await db.agency.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
