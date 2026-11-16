import type { D1Database } from "@cloudflare/workers-types";
import type { Agency, User, ReportingCoverage } from "@prisma/client";
import type { Actor } from "../access";
import { HttpError } from "../http";
import { kpiFilters, buildMetrics } from "../kpi-service";
import type { KpiData } from "../kpi-service";
import {
  reportingWindow,
  shiftDay,
  calendarDate,
  fullCalendarMonths,
  startOfLocalDay,
} from "../reporting-time";
import { D1Unit } from "./unit";
import { guardedD1Batch, type D1Statement, type D1Value } from "./atomic";
const iso = (date: Date) => date.toISOString().replace("Z", "+00:00");
const bucket = (day: string, grain: string) =>
  grain === "month"
    ? day.slice(0, 7) + "-01"
    : grain === "week"
      ? shiftDay(day, -((new Date(day).getUTCDay() + 6) % 7))
      : day;
async function load(
  binding: D1Database,
  inputActor: Actor,
  input: unknown,
): Promise<KpiData> {
  const f = kpiFilters.parse(input),
    unit = new D1Unit(binding);
  let a = inputActor;
  if (!a.demo) {
    const user = (await unit.read<User>("User", '"id"=?', [a.id]))[0];
    if (!user || user.disabled || user.agencyId !== a.agencyId)
      throw new HttpError(403, "Workspace access unavailable");
    a = { ...a, role: user.role };
  }
  const agency = (await unit.read<Agency>("Agency", '"id"=?', [a.agencyId]))[0];
  if (!agency) throw new HttpError(404, "Agency not found");
  if (a.demo && !agency.demo)
    throw new HttpError(403, "Only fictional demo analytics are public");
  if (f.campaign)
    throw new HttpError(
      400,
      "Campaign analytics unavailable: no authorized campaign attribution integration yet.",
    );
  if (a.role === "AGENT" && f.agent && f.agent !== a.id)
    throw new HttpError(403, "Agents can report only assigned enquiries");
  const window = reportingWindow(f.from, f.to, agency.timezone),
    previousWindow = reportingWindow(
      shiftDay(f.from, -window.days),
      shiftDay(f.from, -1),
      agency.timezone,
    );
  const financial = a.role !== "AGENT",
    assigned = a.role === "AGENT" ? a.id : f.agent;
  const calendar = [] as {
    day: string;
    start: string;
    end: string;
    bucket: string;
  }[];
  let start = startOfLocalDay(f.from, agency.timezone);
  for (let day = f.from; day <= f.to; day = shiftDay(day, 1)) {
    const end = startOfLocalDay(shiftDay(day, 1), agency.timezone);
    calendar.push({
      day,
      start: iso(start),
      end: iso(end),
      bucket: bucket(day, f.grain),
    });
    start = end;
  }
  const base = `WITH ls AS(SELECT l.* FROM "Lead" l WHERE l."agencyId"=? AND (?='' OR l."assignedId"=?) AND (?='' OR l.destination=?) AND (?='' OR l.source=?) AND (?='' OR EXISTS(SELECT 1 FROM "Quote" q WHERE q."agencyId"=? AND q."leadId"=l.id AND q."packageId"=?))),
 ledger AS(SELECT t."bookingId",SUM(CASE WHEN t.kind='Receipt' THEN t.amount ELSE 0 END) receipts,SUM(CASE WHEN t.kind='Refund' THEN t.amount ELSE 0 END) refunds,SUM(CASE WHEN t.kind='Expense' THEN t.amount WHEN t.kind='Supplier credit' THEN -t.amount ELSE 0 END) costs FROM "Transaction" t WHERE t."agencyId"=? GROUP BY t."bookingId"),
 bs AS(SELECT b.*,q."packageId",l.customer,l.destination,l.source,l."assignedId",COALESCE(t.receipts,0) receipts,COALESCE(t.refunds,0) refunds,COALESCE(t.costs,0) costs,CASE WHEN b.status='Cancelled' THEN b."cancellationFee" ELSE b.total END sales FROM "Booking" b JOIN ls l ON l.id=b."leadId" AND l."agencyId"=b."agencyId" JOIN "Quote" q ON q.id=b."quoteId" AND q."agencyId"=b."agencyId" LEFT JOIN ledger t ON t."bookingId"=b.id WHERE b."agencyId"=? AND (?='' OR q."packageId"=?))`;
  const baseValues: D1Value[] = [
    a.agencyId,
    assigned,
    assigned,
    f.destination,
    f.destination,
    f.source,
    f.source,
    f.package,
    a.agencyId,
    f.package,
    a.agencyId,
    a.agencyId,
    f.package,
    f.package,
  ];
  const leadPeriod = `date(l."enquiryDate")>=p.fromday AND date(l."enquiryDate")<=p.today`;
  const bookingPeriod = `julianday(b."createdAt")>=julianday(p.startat) AND julianday(b."createdAt")<julianday(p.endat)`;
  const ledgerPeriod = `((t."dateBasis"='CALENDAR' AND date(t.date)>=p.fromday AND date(t.date)<=p.today) OR (t."dateBasis"='INSTANT' AND julianday(t.date)>=julianday(p.startat) AND julianday(t.date)<julianday(p.endat)))`;
  const metrics: D1Statement = {
    sql: `${base},periods(name,fromday,today,startat,endat) AS(VALUES ('current',?,?,?,?),('previous',?,?,?,?))
 SELECT p.name,
 (SELECT count(*) FROM ls l WHERE ${leadPeriod}) leads,
 (SELECT count(*) FROM ls l WHERE ${leadPeriod} AND l.stage IN('Qualified','Quoted','Won')) qualified,
 (SELECT count(*) FROM ls l WHERE ${leadPeriod} AND EXISTS(SELECT 1 FROM bs b WHERE b."leadId"=l.id AND b.status<>'Cancelled')) converted,
 (SELECT count(*) FROM bs b WHERE ${bookingPeriod}) bookings,
 (SELECT count(*) FROM bs b WHERE ${bookingPeriod} AND b.status='Confirmed') confirmed,
 (SELECT count(*) FROM bs b WHERE ${bookingPeriod} AND b.status='Completed') completed,
 (SELECT count(*) FROM bs b WHERE ${bookingPeriod} AND b.status='Cancelled') cancelled,
 (SELECT COALESCE(sum(b.total),0) FROM bs b WHERE ${bookingPeriod}) gbv,
 (SELECT COALESCE(sum(b.sales),0) FROM bs b WHERE ${bookingPeriod}) sales,
 (SELECT COALESCE(sum(max(0,b.sales-b.receipts+b.refunds)),0) FROM bs b WHERE ${bookingPeriod}) due,
 (SELECT COALESCE(sum(b.costs),0) FROM bs b WHERE ${bookingPeriod}) costs,
 (SELECT count(*) FROM bs b WHERE ${bookingPeriod} AND NOT b."directCostsComplete") incomplete,
 (SELECT COALESCE(sum(t.amount),0) FROM "Transaction" t JOIN bs b ON b.id=t."bookingId" WHERE t."agencyId"=? AND t.kind='Receipt' AND ${ledgerPeriod}) receipts,
 (SELECT COALESCE(sum(t.amount),0) FROM "Transaction" t JOIN bs b ON b.id=t."bookingId" WHERE t."agencyId"=? AND t.kind='Refund' AND ${ledgerPeriod}) refunds,
 (SELECT COALESCE(sum(s.amount),0) FROM "Spend" s WHERE s."agencyId"=? AND s.kind='Advertising' AND s.month>=substr(p.fromday,1,7) AND s.month<=substr(p.today,1,7) AND (?='' OR s.channel=?)) adSpend FROM periods p`,
    values: [
      ...baseValues,
      window.from,
      window.to,
      iso(window.start),
      iso(window.end),
      previousWindow.from,
      previousWindow.to,
      iso(previousWindow.start),
      iso(previousWindow.end),
      a.agencyId,
      a.agencyId,
      a.agencyId,
      f.source,
      f.source,
    ],
  };
  const trends: D1Statement = {
    sql: `${base},calendar AS(SELECT json_extract(value,'$.day') day,json_extract(value,'$.start') startat,json_extract(value,'$.end') endat,json_extract(value,'$.bucket') bucket FROM json_each(?)),events AS(
 SELECT c.bucket,1 leads,0 gbv,0 receipts,0 refunds FROM ls l JOIN calendar c ON date(l."enquiryDate")=c.day
 UNION ALL SELECT c.bucket,0,b.total,0,0 FROM bs b JOIN calendar c ON julianday(b."createdAt")>=julianday(c.startat) AND julianday(b."createdAt")<julianday(c.endat)
 UNION ALL SELECT c.bucket,0,0,CASE WHEN t.kind='Receipt' THEN t.amount ELSE 0 END,CASE WHEN t.kind='Refund' THEN t.amount ELSE 0 END FROM "Transaction" t JOIN bs b ON b.id=t."bookingId" JOIN calendar c ON (t."dateBasis"='CALENDAR' AND date(t.date)=c.day) OR (t."dateBasis"='INSTANT' AND julianday(t.date)>=julianday(c.startat) AND julianday(t.date)<julianday(c.endat)) WHERE t."agencyId"=? AND t.kind IN('Receipt','Refund')) SELECT bucket,sum(leads) leads,sum(gbv) gbv,sum(receipts) receipts,sum(refunds) refunds FROM events GROUP BY bucket ORDER BY bucket`,
    values: [...baseValues, JSON.stringify(calendar), a.agencyId],
  };
  const groupLead =
    f.breakdown === "agent"
      ? 'l."assignedId"'
      : f.breakdown === "source"
        ? "l.source"
        : "l.destination";
  const groupBooking =
    f.breakdown === "package"
      ? 'b."packageId"'
      : f.breakdown === "agent"
        ? 'b."assignedId"'
        : f.breakdown === "source"
          ? "b.source"
          : "b.destination";
  const groupLeads =
    f.breakdown === "package"
      ? 'SELECT DISTINCT l.id,q."packageId" k FROM ls l JOIN "Quote" q ON q."leadId"=l.id AND q."agencyId"=? WHERE date(l."enquiryDate")>=? AND date(l."enquiryDate")<=? AND (?=\'\' OR q."packageId"=?)'
      : `SELECT l.id,${groupLead} k FROM ls l WHERE date(l."enquiryDate")>=? AND date(l."enquiryDate")<=?`;
  const groupLeadValues =
    f.breakdown === "package"
      ? [a.agencyId, f.from, f.to, f.package, f.package]
      : [f.from, f.to];
  const performance: D1Statement = {
    sql: `${base},gl AS(${groupLeads}),lc AS(SELECT gl.k,count(*) leads,SUM(CASE WHEN EXISTS(SELECT 1 FROM bs b WHERE b."leadId"=gl.id AND b.status<>'Cancelled' AND (?<>'package' OR b."packageId"=gl.k)) THEN 1 ELSE 0 END) converted FROM gl GROUP BY gl.k),bc AS(SELECT ${groupBooking} k,count(*) bookings,sum(b.total) gbv,sum(b.sales) sales,sum(b.costs) costs,SUM(CASE WHEN NOT b."directCostsComplete" THEN 1 ELSE 0 END) incomplete FROM bs b WHERE julianday(b."createdAt")>=julianday(?) AND julianday(b."createdAt")<julianday(?) GROUP BY 1),keys AS(SELECT k FROM lc UNION SELECT k FROM bc)
 SELECT keys.k key,COALESCE(lc.leads,0) leads,COALESCE(lc.converted,0) converted,COALESCE(bc.bookings,0) bookings,COALESCE(bc.gbv,0) gbv,COALESCE(bc.costs,0) costs,COALESCE(bc.sales,0) sales,COALESCE(bc.incomplete,0) incomplete,count(*)OVER() total FROM keys LEFT JOIN lc ON lc.k=keys.k LEFT JOIN bc ON bc.k=keys.k ORDER BY gbv DESC,key ASC LIMIT 20 OFFSET ?`,
    values: [
      ...baseValues,
      ...groupLeadValues,
      f.breakdown,
      iso(window.start),
      iso(window.end),
      f.page * 20,
    ],
  };
  const queries: D1Statement[] = [
    metrics,
    trends,
    performance,
    {
      sql: 'SELECT id,name FROM "Package" WHERE "agencyId"=? ORDER BY name',
      values: [a.agencyId],
    },
    {
      sql:
        'SELECT id,name FROM "User" WHERE "agencyId"=?' +
        (a.role === "AGENT" ? " AND id=?" : "") +
        " ORDER BY name",
      values: [a.agencyId, ...(a.role === "AGENT" ? [a.id] : [])],
    },
    {
      sql:
        'SELECT DISTINCT destination FROM "Lead" WHERE "agencyId"=?' +
        (a.role === "AGENT" ? ' AND "assignedId"=?' : "") +
        " LIMIT 501",
      values: [a.agencyId, ...(a.role === "AGENT" ? [a.id] : [])],
    },
    {
      sql:
        'SELECT DISTINCT source FROM "Lead" WHERE "agencyId"=?' +
        (a.role === "AGENT" ? ' AND "assignedId"=?' : "") +
        " LIMIT 501",
      values: [a.agencyId, ...(a.role === "AGENT" ? [a.id] : [])],
    },
    {
      sql: 'SELECT * FROM "ReportingCoverage" WHERE "agencyId"=? AND timezone=? AND source=? AND kind=\'Advertising\' AND (("fromDate"=? AND "toDate"=?) OR ("fromDate"=? AND "toDate"=?))',
      values: [
        a.agencyId,
        agency.timezone,
        f.source,
        window.from,
        window.to,
        previousWindow.from,
        previousWindow.to,
      ],
    },
  ];
  const output = await guardedD1Batch(binding, unit.guards, queries);
  const rows = output[0].results as (Record<string, number> & {
    name: string;
  })[];
  const trendRows = output[1].results as {
    bucket: string;
    leads: number;
    gbv: number;
    receipts: number;
    refunds: number;
  }[];
  const groups = output[2].results as {
    key: string;
    leads: number;
    converted: number;
    bookings: number;
    gbv: number;
    costs: number;
    sales: number;
    incomplete: number;
    total: number;
  }[];
  const packages = output[3].results as { id: string; name: string }[],
    users = output[4].results as { id: string; name: string }[];
  if (f.package && !packages.some((pkg) => pkg.id === f.package))
    throw new HttpError(404, "Package not found");
  if (f.agent && !users.some((user) => user.id === f.agent))
    throw new HttpError(404, "Agent not found");
  const coverage = output[7].results as unknown as ReportingCoverage[];
  const complete = (period: { from: string; to: string }) =>
    fullCalendarMonths(period.from, period.to) &&
    period.to < calendarDate(new Date(), agency.timezone) &&
    !f.package &&
    !f.agent &&
    !f.destination &&
    financial &&
    coverage.some(
      (row) => row.fromDate === period.from && row.toDate === period.to,
    );
  const reason = !fullCalendarMonths(f.from, f.to)
    ? "Daily ad facts unavailable: selected range cuts across monthly manual spend."
    : f.package || f.agent || f.destination || !financial
      ? "Spend cannot be allocated to package/agent/destination dimensions."
      : "Owner-attested exact-period/source advertising coverage is missing.";
  const trendMap = new Map(trendRows.map((row) => [row.bucket, row])),
    buckets = new Set(calendar.map((row) => row.bucket));
  return {
    asOf: new Date().toISOString(),
    currency: "INR",
    filters: f,
    timezone: agency.timezone,
    period: {
      from: window.from,
      to: window.to,
      start: window.start.toISOString(),
      endExclusive: window.end.toISOString(),
    },
    previousPeriod: { from: previousWindow.from, to: previousWindow.to },
    financial,
    current: buildMetrics(
      rows.find((row) => row.name === "current")!,
      financial,
      complete(window),
      reason,
    ),
    previous: buildMetrics(
      rows.find((row) => row.name === "previous")!,
      financial,
      complete(previousWindow),
      "Previous-period aligned advertising coverage missing.",
    ),
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
    performance: groups.map((row) => ({
      key: row.key,
      label:
        f.breakdown === "agent"
          ? users.find((user) => user.id === row.key)?.name || "Unknown agent"
          : f.breakdown === "package"
            ? packages.find((pkg) => pkg.id === row.key)?.name ||
              "Unknown package"
            : row.key || "Unknown",
      leads: row.leads,
      conversion: row.leads ? row.converted / row.leads : null,
      bookings: row.bookings,
      gbv: row.gbv,
      ...(financial
        ? {
            recordedCosts: row.costs,
            contribution: row.incomplete === 0 ? row.sales - row.costs : null,
            margin:
              row.incomplete === 0 && row.sales > 0
                ? (row.sales - row.costs) / row.sales
                : null,
          }
        : {}),
    })),
    totalGroups: groups[0]?.total || 0,
    options: {
      packages,
      agents: users,
      destinations: (output[5].results as { destination: string }[])
        .map((row) => row.destination)
        .sort(),
      sources: (output[6].results as { source: string }[])
        .map((row) => row.source)
        .sort(),
      campaigns: [],
    },
    coverage: {
      adComplete: complete(window),
      source: f.source,
      revision: financial ? agency.adSpendRevision : 0,
    },
    demo: !!a.demo,
  };
}
export async function kpiDataD1(
  binding: D1Database,
  actor: Actor,
  input: unknown,
): Promise<KpiData> {
  for (let attempt = 0; ; attempt++)
    try {
      return await load(binding, actor, input);
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof HttpError &&
        error.status === 409 &&
        error.message.startsWith("This record changed")
      )
        continue;
      throw error;
    }
}
