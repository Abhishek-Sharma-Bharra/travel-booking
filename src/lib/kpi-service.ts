import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db as database } from "./db";
import type { Actor } from "./access";
import { HttpError } from "./http";
import {
  reportingWindow,
  shiftDay,
  fullCalendarMonths,
  calendarDate,
} from "./reporting-time";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !isNaN(+new Date(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid calendar date",
  );
export const kpiFilters = z.object({
  from: day,
  to: day,
  destination: z.string().max(100).default(""),
  source: z.string().max(100).default(""),
  agent: z.string().max(100).default(""),
  package: z.string().max(100).default(""),
  campaign: z.string().max(100).default(""),
  grain: z.enum(["day", "week", "month"]).default("day"),
  breakdown: z
    .enum(["destination", "agent", "source", "package"])
    .default("destination"),
  page: z.coerce.number().int().min(0).max(10000).default(0),
});
export type KpiFilters = z.infer<typeof kpiFilters>;
type Row = Record<string, number>;
export type Metric = {
  key: string;
  label: string;
  value: number | null;
  format: "count" | "money" | "percent";
  basis: string;
  reason?: string;
};
export function buildMetrics(
  r: Row,
  financial: boolean,
  adComplete: boolean,
  adReason: string,
): Metric[] {
  const value = (k: string) => {
    const n = Number(r[k] ?? 0);
    if (!Number.isSafeInteger(n))
      throw new Error("Analytics total exceeds safe precision");
    return n;
  };
  const m = (
    key: string,
    label: string,
    n: number | null,
    format: Metric["format"],
    basis: string,
    reason?: string,
  ): Metric => ({
    key,
    label,
    value: n,
    format,
    basis,
    ...(reason ? { reason } : {}),
  });
  const leads = value("leads"),
    bookings = value("bookings"),
    sales = value("sales"),
    cost = value("costs");
  const costComplete = value("incomplete") === 0;
  const unavailable =
    "Provider verification is not connected. Manual ledger entries are reported separately.";
  return [
    m(
      "leads",
      "Total leads",
      leads,
      "count",
      "Enquiry-date cohort; one lead is one enquiry, not one unique person.",
    ),
    m(
      "qualified",
      "Qualified leads",
      value("qualified"),
      "count",
      "Current Qualified, Quoted or Won stage within enquiry cohort; not historical qualification events.",
    ),
    m(
      "conversion",
      "Lead-to-booking conversion",
      leads ? value("converted") / leads : null,
      "percent",
      "Enquiry cohort with a current non-cancelled booking / leads in that same cohort; current-state snapshot.",
      leads ? undefined : "No leads in selected cohort.",
    ),
    m(
      "confirmed",
      "Confirmed bookings",
      value("confirmed"),
      "count",
      "Current Confirmed status within booking-created cohort. Completed bookings are separate.",
    ),
    m(
      "completed",
      "Completed bookings",
      value("completed"),
      "count",
      "Current Completed status within booking-created cohort.",
    ),
    m(
      "cancellations",
      "Cancellation rate",
      bookings ? value("cancelled") / bookings : null,
      "percent",
      "Currently cancelled / all bookings created in selected period.",
      bookings ? undefined : "No bookings in selected cohort.",
    ),
    m(
      "gbv",
      "Gross booking value",
      value("gbv"),
      "money",
      "Original booking commitments created in period, including cancelled originals; includes recorded quote tax. Not recognized revenue.",
    ),
    m(
      "sales",
      "Cancellation-adjusted value",
      sales,
      "money",
      "Current commitment: total for non-cancelled bookings; retained cancellation fee for cancelled bookings. Includes recorded tax.",
    ),
    m(
      "verified",
      "Verified payment collections",
      null,
      "money",
      "Captured payments verified against provider identities/event records.",
      unavailable,
    ),
    m(
      "receipts",
      "Manual receipts",
      value("receipts"),
      "money",
      "Receipt ledger entries by recorded calendar date; explicitly timestamped entries use agency timezone. Not independently payment-verified.",
    ),
    m(
      "refunds",
      "Manual refunds",
      value("refunds"),
      "money",
      "Refund entries by their own recorded calendar date or explicit timestamp basis; not provider-verified.",
    ),
    m(
      "netCash",
      "Manual net cash recorded",
      value("receipts") - value("refunds"),
      "money",
      "Period manual receipts minus period manual refunds; not profit or settlement payouts.",
    ),
    m(
      "outstanding",
      "Current customer outstanding",
      value("due"),
      "money",
      "Current balance of booking-created cohort, using all recorded receipts/refunds; not historical as-of balance.",
    ),
    m(
      "failures",
      "Payment failures",
      null,
      "count",
      "Provider payment-attempt failures in period.",
      unavailable,
    ),
    m(
      "fees",
      "Gateway fees",
      null,
      "money",
      "Provider fees/adjustments, separate from receipts and settlements.",
      unavailable,
    ),
    m(
      "settlements",
      "Settlement payouts",
      null,
      "money",
      "Merchant payouts; not a second customer collection.",
      unavailable,
    ),
    m(
      "advertising",
      "Advertising spend",
      financial && adComplete ? value("adSpend") : null,
      "money",
      "Monthly manual records only; exact full-month coverage explicitly attested by owner.",
      !financial
        ? "Restricted to owner/manager."
        : adComplete
          ? undefined
          : adReason,
    ),
    m(
      "recordedAds",
      "Recorded monthly advertising subtotal",
      financial ? value("adSpend") : null,
      "money",
      "Available monthly records touching this range; may include days outside range. Incomplete subtotal, not full period spend.",
      financial
        ? "Agency/source monthly subtotal only; not allocated to destination, agent or package filters. Completeness is not implied."
        : "Restricted to owner/manager.",
    ),
    m(
      "cpl",
      "Cost per lead",
      financial && adComplete && leads
        ? Math.round(value("adSpend") / leads)
        : null,
      "money",
      "Aligned, owner-attested manual source spend / source-attributed CRM enquiry cohort.",
      !financial
        ? "Restricted to owner/manager."
        : !adComplete
          ? adReason
          : !leads
            ? "No matched CRM leads."
            : undefined,
    ),
    m(
      "cac",
      "Cost per acquired booking",
      financial && adComplete && value("converted")
        ? Math.round(value("adSpend") / value("converted"))
        : null,
      "money",
      "Same enquiry acquisition cohort; current non-cancelled bookings.",
      !financial
        ? "Restricted to owner/manager."
        : !adComplete
          ? adReason
          : !value("converted")
            ? "No acquired non-cancelled bookings."
            : undefined,
    ),
    m(
      "costs",
      "Recorded direct cost subtotal",
      financial ? cost : null,
      "money",
      "Supplier expenses minus supplier credits for booking cohort; recorded subtotal, may be incomplete.",
      !financial
        ? "Restricted to owner/manager."
        : !costComplete
          ? "Some booking costs have not been explicitly marked complete."
          : undefined,
    ),
    m(
      "contribution",
      "Contribution before sales-tax reconciliation",
      financial && costComplete ? sales - cost : null,
      "money",
      "Cancellation-adjusted commitments minus complete recorded direct costs. Commitments include quote tax; this is not tax-exclusive accounting profit.",
      !financial
        ? "Restricted to owner/manager."
        : !costComplete
          ? "Direct costs incomplete. Manager attestation required per booking."
          : undefined,
    ),
    m(
      "margin",
      "Contribution margin",
      financial && costComplete && sales > 0 ? (sales - cost) / sales : null,
      "percent",
      "Contribution / matching cancellation-adjusted commitments; before overheads, ads, fees and statutory tax reconciliation.",
      !financial
        ? "Restricted to owner/manager."
        : !costComplete
          ? "Direct costs incomplete."
          : sales <= 0
            ? "No positive sales denominator."
            : undefined,
    ),
    m(
      "recognized",
      "Recognized revenue",
      null,
      "money",
      "Requires explicit accounting recognition events and policy.",
      "No recognition policy/events recorded.",
    ),
    m(
      "profit",
      "Net profit",
      null,
      "money",
      "Requires recognized revenue and complete direct costs, taxes, fees, overheads and adjustments.",
      "Required accounting categories and period completeness are unavailable.",
    ),
  ];
}
async function loadKpi(
  inputActor: Actor,
  input: unknown,
  db: Prisma.TransactionClient,
) {
  const f = kpiFilters.parse(input);
  let a = inputActor;
  if (!a.demo) {
    const u = await db.user.findUnique({ where: { id: a.id } });
    if (!u || u.disabled || u.agencyId !== a.agencyId)
      throw new HttpError(403, "Workspace access unavailable");
    a = { ...a, role: u.role };
  }
  const agency = await db.agency.findUniqueOrThrow({
    where: { id: a.agencyId },
  });
  if (a.demo && !agency.demo)
    throw new HttpError(403, "Only fictional demo analytics are public");
  if (f.campaign)
    throw new HttpError(
      400,
      "Campaign analytics unavailable: no authorized campaign attribution integration yet.",
    );
  if (a.role === "AGENT" && f.agent && f.agent !== a.id)
    throw new HttpError(403, "Agents can report only assigned enquiries");
  const w = reportingWindow(f.from, f.to, agency.timezone),
    prev = reportingWindow(
      shiftDay(f.from, -w.days),
      shiftDay(f.from, -1),
      agency.timezone,
    );
  const financial = a.role !== "AGENT";
  const packages = await db.package.findMany({
    where: { agencyId: a.agencyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const users = await db.user.findMany({
    where: {
      agencyId: a.agencyId,
      ...(a.role === "AGENT" ? { id: a.id } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (f.package && !packages.some((p) => p.id === f.package))
    throw new HttpError(404, "Package not found");
  if (f.agent && !users.some((u) => u.id === f.agent))
    throw new HttpError(404, "Agent not found");
  const [destinations, sources] = await Promise.all(
    ["destination", "source"].map((field) =>
      db.lead.findMany({
        where: {
          agencyId: a.agencyId,
          ...(a.role === "AGENT" ? { assignedId: a.id } : {}),
        },
        distinct: [field as "destination" | "source"],
        select: { destination: true, source: true },
        take: 501,
      }),
    ),
  );
  const assigned = a.role === "AGENT" ? a.id : f.agent;
  const leadScope = Prisma.sql`l."agencyId"=${a.agencyId} AND (${assigned}='' OR l."assignedId"=${assigned}) AND (${f.destination}='' OR l.destination=${f.destination}) AND (${f.source}='' OR l.source=${f.source}) AND (${f.package}='' OR EXISTS(SELECT 1 FROM "Quote" q WHERE q."agencyId"=${a.agencyId} AND q."leadId"=l.id AND q."packageId"=${f.package}))`;
  const base = Prisma.sql`WITH ls AS(SELECT l.* FROM "Lead" l WHERE ${leadScope}),
 bs AS(SELECT b.*,q."packageId",l.customer,l.destination,l.source,l."assignedId",COALESCE(t.receipts,0)::double precision AS receipts,COALESCE(t.refunds,0)::double precision AS refunds,COALESCE(t.costs,0)::double precision AS costs,
 CASE WHEN b.status='Cancelled' THEN b."cancellationFee" ELSE b.total END::double precision AS sales
 FROM "Booking" b JOIN ls l ON l.id=b."leadId" AND l."agencyId"=b."agencyId" JOIN "Quote" q ON q.id=b."quoteId" AND q."agencyId"=b."agencyId"
 LEFT JOIN LATERAL(SELECT SUM(CASE WHEN t.kind='Receipt' THEN t.amount ELSE 0 END) receipts,SUM(CASE WHEN t.kind='Refund' THEN t.amount ELSE 0 END) refunds,SUM(CASE WHEN t.kind='Expense' THEN t.amount WHEN t.kind='Supplier credit' THEN -t.amount ELSE 0 END) costs FROM "Transaction" t WHERE t."bookingId"=b.id AND t."agencyId"=${a.agencyId})t ON true
 WHERE b."agencyId"=${a.agencyId} AND (${f.package}='' OR q."packageId"=${f.package})),
 periods AS(SELECT 'current'::text name,${w.from}::date fromday,${w.to}::date today,(${w.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') startat,(${w.end.toISOString()}::timestamptz AT TIME ZONE 'UTC') endat UNION ALL SELECT 'previous',${prev.from}::date,${prev.to}::date,(${prev.start.toISOString()}::timestamptz AT TIME ZONE 'UTC'),(${prev.end.toISOString()}::timestamptz AT TIME ZONE 'UTC'))`;
  const rows = await db.$queryRaw<(Row & { name: string })[]>(Prisma.sql`${base}
 SELECT p.name,
 (SELECT count(*)::int FROM ls l WHERE l."enquiryDate">=p.fromday AND l."enquiryDate"<p.today+1) leads,
 (SELECT count(*)::int FROM ls l WHERE l."enquiryDate">=p.fromday AND l."enquiryDate"<p.today+1 AND l.stage IN('Qualified','Quoted','Won')) qualified,
 (SELECT count(*)::int FROM ls l WHERE l."enquiryDate">=p.fromday AND l."enquiryDate"<p.today+1 AND EXISTS(SELECT 1 FROM bs b WHERE b."leadId"=l.id AND b.status<>'Cancelled')) converted,
 (SELECT count(*)::int FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat) bookings,
 (SELECT count(*)::int FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat AND b.status='Confirmed') confirmed,
 (SELECT count(*)::int FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat AND b.status='Completed') completed,
 (SELECT count(*)::int FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat AND b.status='Cancelled') cancelled,
 (SELECT COALESCE(sum(b.total),0)::double precision FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat) gbv,
 (SELECT COALESCE(sum(b.sales),0)::double precision FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat) sales,
 (SELECT COALESCE(sum(GREATEST(0,b.sales-b.receipts+b.refunds)),0)::double precision FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat) due,
 (SELECT COALESCE(sum(b.costs),0)::double precision FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat) costs,
 (SELECT count(*)::int FROM bs b WHERE b."createdAt">=p.startat AND b."createdAt"<p.endat AND NOT b."directCostsComplete") incomplete,
 (SELECT COALESCE(sum(t.amount),0)::double precision FROM "Transaction" t JOIN bs b ON b.id=t."bookingId" WHERE t."agencyId"=${a.agencyId} AND t.kind='Receipt' AND ((t."dateBasis"='CALENDAR' AND t.date>=p.fromday AND t.date<p.today+1) OR (t."dateBasis"='INSTANT' AND t.date>=p.startat AND t.date<p.endat))) receipts,
 (SELECT COALESCE(sum(t.amount),0)::double precision FROM "Transaction" t JOIN bs b ON b.id=t."bookingId" WHERE t."agencyId"=${a.agencyId} AND t.kind='Refund' AND ((t."dateBasis"='CALENDAR' AND t.date>=p.fromday AND t.date<p.today+1) OR (t."dateBasis"='INSTANT' AND t.date>=p.startat AND t.date<p.endat))) refunds,
 (SELECT COALESCE(sum(s.amount),0)::double precision FROM "Spend" s WHERE s."agencyId"=${a.agencyId} AND s.kind='Advertising' AND s.month>=to_char(p.fromday,'YYYY-MM') AND s.month<=to_char(p.today,'YYYY-MM') AND (${f.source}='' OR s.channel=${f.source})) "adSpend"
 FROM periods p`);
  const coverage = await db.reportingCoverage.findMany({
    where: {
      agencyId: a.agencyId,
      timezone: agency.timezone,
      source: f.source,
      kind: "Advertising",
      OR: [
        { fromDate: w.from, toDate: w.to },
        { fromDate: prev.from, toDate: prev.to },
      ],
    },
  });
  const reason = !fullCalendarMonths(f.from, f.to)
    ? "Daily ad facts unavailable: selected range cuts across monthly manual spend."
    : f.package || f.agent || f.destination || a.role === "AGENT"
      ? "Spend cannot be allocated to package/agent/destination dimensions."
      : "Owner-attested exact-period/source advertising coverage is missing.";
  const complete = (r: { from: string; to: string }) =>
    fullCalendarMonths(r.from, r.to) &&
    r.to < calendarDate(new Date(), agency.timezone) &&
    !f.package &&
    !f.agent &&
    !f.destination &&
    financial &&
    coverage.some((c) => c.fromDate === r.from && c.toDate === r.to);
  const current = buildMetrics(
    rows.find((r) => r.name === "current")!,
    financial,
    complete(w),
    reason,
  );
  const previous = buildMetrics(
    rows.find((r) => r.name === "previous")!,
    financial,
    complete(prev),
    "Previous-period aligned advertising coverage missing.",
  );
  const trends = await db.$queryRaw<
    {
      bucket: string;
      leads: number;
      gbv: number;
      receipts: number;
      refunds: number;
    }[]
  >(Prisma.sql`${base}, events AS(
 SELECT l."enquiryDate"::date d,1::int leads,0::bigint gbv,0::bigint receipts,0::bigint refunds FROM ls l WHERE l."enquiryDate">=${w.from}::date AND l."enquiryDate"<${shiftDay(w.to, 1)}::date
 UNION ALL SELECT (b."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${agency.timezone})::date,0,b.total,0,0 FROM bs b WHERE b."createdAt">=(${w.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND b."createdAt"<(${w.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
 UNION ALL SELECT CASE WHEN t."dateBasis"='CALENDAR' THEN t.date::date ELSE(t.date AT TIME ZONE 'UTC' AT TIME ZONE ${agency.timezone})::date END,0,0,CASE WHEN t.kind='Receipt' THEN t.amount ELSE 0 END,CASE WHEN t.kind='Refund' THEN t.amount ELSE 0 END FROM "Transaction"t JOIN bs b ON b.id=t."bookingId" WHERE t."agencyId"=${a.agencyId} AND t.kind IN('Receipt','Refund') AND ((t."dateBasis"='CALENDAR' AND t.date>=${w.from}::date AND t.date<${shiftDay(w.to, 1)}::date) OR (t."dateBasis"='INSTANT' AND t.date>=(${w.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND t.date<(${w.end.toISOString()}::timestamptz AT TIME ZONE 'UTC'))))
 SELECT to_char(date_trunc(${f.grain},d::timestamp),'YYYY-MM-DD') bucket,sum(leads)::int leads,sum(gbv)::double precision gbv,sum(receipts)::double precision receipts,sum(refunds)::double precision refunds FROM events GROUP BY 1 ORDER BY 1`);
  const groupLead =
    f.breakdown === "agent"
      ? Prisma.sql`l."assignedId"`
      : f.breakdown === "source"
        ? Prisma.sql`l.source`
        : Prisma.sql`l.destination`;
  const groupBooking =
    f.breakdown === "package"
      ? Prisma.sql`b."packageId"`
      : f.breakdown === "agent"
        ? Prisma.sql`b."assignedId"`
        : f.breakdown === "source"
          ? Prisma.sql`b.source`
          : Prisma.sql`b.destination`;
  const groupedLeads =
    f.breakdown === "package"
      ? Prisma.sql`SELECT DISTINCT l.id,q."packageId" k FROM ls l JOIN "Quote"q ON q."leadId"=l.id AND q."agencyId"=${a.agencyId} WHERE l."enquiryDate">=${w.from}::date AND l."enquiryDate"<${shiftDay(w.to, 1)}::date AND (${f.package}='' OR q."packageId"=${f.package})`
      : Prisma.sql`SELECT l.id,${groupLead} k FROM ls l WHERE l."enquiryDate">=${w.from}::date AND l."enquiryDate"<${shiftDay(w.to, 1)}::date`;
  const performance = await db.$queryRaw<
    {
      key: string;
      leads: number;
      converted: number;
      bookings: number;
      gbv: number;
      costs: number;
      sales: number;
      incomplete: number;
      total: number;
    }[]
  >(Prisma.sql`${base},gl AS(${groupedLeads}),lc AS(SELECT gl.k,count(*)::int leads,count(*)FILTER(WHERE EXISTS(SELECT 1 FROM bs b WHERE b."leadId"=gl.id AND b.status<>'Cancelled' AND (${f.breakdown}<>'package' OR b."packageId"=gl.k)))::int converted FROM gl GROUP BY gl.k),bc AS(SELECT ${groupBooking} k,count(*)::int bookings,sum(b.total)::double precision gbv,sum(b.sales)::double precision sales,sum(b.costs)::double precision costs,count(*) FILTER(WHERE NOT b."directCostsComplete")::int incomplete FROM bs b WHERE b."createdAt">=(${w.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND b."createdAt"<(${w.end.toISOString()}::timestamptz AT TIME ZONE 'UTC') GROUP BY 1)
 SELECT COALESCE(lc.k,bc.k) key,COALESCE(lc.leads,0)::int leads,COALESCE(lc.converted,0)::int converted,COALESCE(bc.bookings,0)::int bookings,COALESCE(bc.gbv,0)::double precision gbv,COALESCE(bc.costs,0)::double precision costs,COALESCE(bc.sales,0)::double precision sales,COALESCE(bc.incomplete,0)::int incomplete,count(*)OVER()::int total FROM lc FULL JOIN bc ON lc.k=bc.k ORDER BY gbv DESC,key ASC LIMIT 20 OFFSET ${f.page * 20}`);
  const trendMap = new Map(trends.map((t) => [t.bucket, t]));
  const buckets = new Set<string>();
  for (let d = w.from; d <= w.to; d = shiftDay(d, 1)) {
    let bucket = d;
    if (f.grain === "month") bucket = d.slice(0, 7) + "-01";
    if (f.grain === "week") {
      const wd = new Date(d + "T00:00:00Z").getUTCDay();
      bucket = shiftDay(d, -((wd + 6) % 7));
    }
    buckets.add(bucket);
  }
  return {
    asOf: new Date().toISOString(),
    timezone: agency.timezone,
    currency: "INR",
    filters: f,
    period: {
      from: w.from,
      to: w.to,
      start: w.start.toISOString(),
      endExclusive: w.end.toISOString(),
    },
    previousPeriod: { from: prev.from, to: prev.to },
    financial,
    current,
    previous,
    trends: [...buckets].map(
      (bucket) =>
        trendMap.get(bucket) || {
          bucket,
          leads: 0,
          gbv: 0,
          receipts: 0,
          refunds: 0,
        },
    ),
    performance: performance.map((r) => ({
      key: r.key,
      label:
        f.breakdown === "agent"
          ? users.find((u) => u.id === r.key)?.name || "Unknown agent"
          : f.breakdown === "package"
            ? packages.find((p) => p.id === r.key)?.name || "Unknown package"
            : r.key || "Unknown",
      leads: r.leads,
      conversion: r.leads ? r.converted / r.leads : null,
      bookings: r.bookings,
      gbv: r.gbv,
      ...(financial
        ? {
            recordedCosts: r.costs,
            contribution: r.incomplete === 0 ? r.sales - r.costs : null,
            margin:
              r.incomplete === 0 && r.sales > 0
                ? (r.sales - r.costs) / r.sales
                : null,
          }
        : {}),
    })),
    totalGroups: performance[0]?.total || 0,
    options: {
      packages,
      agents: users,
      destinations: destinations.map((l) => l.destination).sort(),
      sources: sources.map((l) => l.source).sort(),
      campaigns: [] as string[],
    },
    coverage: {
      adComplete: complete(w),
      source: f.source,
      revision: financial ? agency.adSpendRevision : 0,
    },
    demo: !!a.demo,
  };
}
export async function kpiData(inputActor: Actor, input: unknown) {
  return database.$transaction((tx) => loadKpi(inputActor, input, tx), {
    isolationLevel: "RepeatableRead",
    timeout: 25000,
  });
}
export type KpiData = Awaited<ReturnType<typeof kpiData>>;
