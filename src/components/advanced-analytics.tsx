"use client";
import { useEffect, useRef, useState } from "react";
import type { Dataset } from "@/lib/data";
import type { KpiData, Metric } from "@/lib/kpi-service";
import {
  calendarDate,
  shiftDay,
  fullCalendarMonths,
} from "@/lib/reporting-time";
import { inr } from "@/lib/money";
import { safeCsv } from "@/lib/validation";
function formatted(m: Pick<Metric, "value" | "format">) {
  return m.value === null
    ? "Data unavailable"
    : m.format === "money"
      ? inr(m.value)
      : m.format === "percent"
        ? (m.value * 100).toFixed(1) + "%"
        : m.value.toLocaleString("en-IN");
}
export default function AdvancedAnalytics({
  data,
  onChange,
}: {
  data: Dataset;
  onChange: (
    action: string,
    input: Record<string, unknown>,
  ) => Promise<boolean>;
}) {
  const today = calendarDate(new Date(), data.agency.timezone);
  const [query, setQuery] = useState({
    from: today.slice(0, 7) + "-01",
    to: today,
    destination: "",
    source: "",
    agent: "",
    package: "",
    campaign: "",
    grain: "day",
    breakdown: "destination",
    page: "0",
  });
  const [report, setReport] = useState<KpiData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [trend, setTrend] = useState<"leads" | "gbv" | "receipts" | "refunds">(
      "leads",
    ),
    [selected, setSelected] = useState(""),
    [exportSection, setExportSection] = useState("metrics"),
    [coverageBusy, setCoverageBusy] = useState(false);
  const requestId = useRef(0);
  useEffect(() => {
    const controller = new AbortController(),
      id = ++requestId.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams(query);
        if (data.demo) params.set("demo", "1");
        const r = await fetch("/api/analytics?" + params, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Analytics unavailable");
        if (requestId.current === id) {
          setReport(body);
          setSelected("");
        }
      } catch (e) {
        if (!controller.signal.aborted && requestId.current === id)
          setError(
            (e as Error).name === "TimeoutError"
              ? "Analytics took too long. Retry or shorten the reporting range."
              : (e as Error).message,
          );
      } finally {
        if (!controller.signal.aborted && requestId.current === id)
          setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, data.demo, refresh]);
  const update = (key: string, value: string) =>
    setQuery((q) => ({
      ...q,
      [key]: value,
      page: key === "page" ? value : "0",
    }));
  const preset = (kind: string) => {
    let from = today;
    if (kind === "week") {
      const weekday = new Date(today + "T00:00:00Z").getUTCDay();
      from = shiftDay(today, -((weekday + 6) % 7));
    }
    if (kind === "month") from = today.slice(0, 7) + "-01";
    setQuery((q) => ({ ...q, from, to: today, page: "0" }));
  };
  function exportCsv() {
    if (!report) return;
    const metadata = {
      from: report.period.from,
      to: report.period.to,
      timezone: report.timezone,
      currency: report.currency,
      asOf: report.asOf,
    };
    let rows: Record<string, unknown>[];
    if (exportSection === "metrics")
      rows = report.current.map((m) => ({
        ...metadata,
        metric: m.label,
        value: m.value ?? "Data unavailable",
        unit:
          m.format === "money"
            ? "INR paise"
            : m.format === "percent"
              ? "fraction"
              : "count",
        previousValue:
          report.previous.find((p) => p.key === m.key)?.value ??
          "Data unavailable",
        previousFrom: report.previousPeriod.from,
        previousTo: report.previousPeriod.to,
        basis: m.basis,
        reason: m.reason || "",
      }));
    else if (exportSection === "trends")
      rows = report.trends.map((r) => ({
        ...metadata,
        ...r,
        gbvUnit: "INR paise",
        receiptsUnit: "INR paise; manual",
        refundsUnit: "INR paise; manual",
      }));
    else
      rows = report.performance.map((r) => ({
        ...metadata,
        breakdown: report.filters.breakdown,
        page: report.filters.page + 1,
        ...r,
        contribution:
          "contribution" in r
            ? (r.contribution ?? "Data unavailable")
            : "Restricted",
        moneyUnit: "INR paise",
        conversionUnit: "fraction",
      }));
    const url = URL.createObjectURL(
      new Blob([safeCsv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `travelos-${exportSection}-${report.period.from}-${report.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const peak = report ? Math.max(1, ...report.trends.map((r) => r[trend])) : 1;
  return (
    <section className="analytics-dashboard" aria-busy={loading}>
      <div className="assistant-card">
        <h2>Advanced KPI dashboard</h2>
        <p>
          Server-calculated, tenant-scoped metrics. Financial amounts are INR.
          Manual receipts, booking commitments and verified collections are
          distinct.
        </p>
        <div className="assistant-controls">
          <button className="btn secondary" onClick={() => preset("day")}>
            Today
          </button>
          <button className="btn secondary" onClick={() => preset("week")}>
            This week
          </button>
          <button className="btn secondary" onClick={() => preset("month")}>
            This month
          </button>
          <button
            className="btn secondary"
            onClick={() => setRefresh((x) => x + 1)}
          >
            Refresh analytics
          </button>
        </div>
        <div className="assistant-controls">
          <label>
            Analytics from
            <input
              type="date"
              value={query.from}
              onChange={(e) => update("from", e.target.value)}
            />
          </label>
          <label>
            Analytics to
            <input
              type="date"
              value={query.to}
              onChange={(e) => update("to", e.target.value)}
            />
          </label>
          <label>
            Analytics destination
            <select
              aria-label="Analytics destination"
              value={query.destination}
              onChange={(e) => update("destination", e.target.value)}
            >
              <option value="">All destinations</option>
              {report?.options.destinations.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Analytics source
            <select
              aria-label="Analytics source"
              value={query.source}
              onChange={(e) => update("source", e.target.value)}
            >
              <option value="">All sources</option>
              {report?.options.sources.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Analytics agent
            <select
              aria-label="Analytics agent"
              value={query.agent}
              onChange={(e) => update("agent", e.target.value)}
            >
              <option value="">
                {data.actor.role === "AGENT"
                  ? "My assigned enquiries"
                  : "All agents"}
              </option>
              {report?.options.agents.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Analytics package
            <select
              aria-label="Analytics package"
              value={query.package}
              onChange={(e) => update("package", e.target.value)}
            >
              <option value="">All packages</option>
              {report?.options.packages.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Campaign
            <select
              disabled
              aria-label="Campaign"
              aria-describedby="campaign-unavailable"
            >
              <option>Data unavailable</option>
            </select>
          </label>
        </div>
        <p id="campaign-unavailable">
          Campaign IDs and authorized ad-account integrations are not available
          yet. No campaign data is invented.
        </p>
        {loading && (
          <p role="status">
            Updating analytics…{" "}
            {report
              ? "The last successful report remains below; exports are paused."
              : ""}
          </p>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}{" "}
            <button
              className="btn secondary"
              onClick={() => setRefresh((x) => x + 1)}
            >
              Retry analytics
            </button>
          </p>
        )}
        {report && (
          <>
            <p>
              Showing {report.period.from} through {report.period.to} ·{" "}
              {report.timezone} · refreshed{" "}
              {new Date(report.asOf).toLocaleString("en-IN", {
                timeZone: report.timezone,
              })}
              . Previous comparison: {report.previousPeriod.from} through{" "}
              {report.previousPeriod.to}.
            </p>
            <p>
              Comparisons use equal calendar-day windows and current record
              status. Today may be partial; comparisons are not pace-adjusted.
              Enquiries use their recorded calendar dates; event timestamps use
              your agency timezone.
            </p>
            <div className="assistant-controls">
              <label>
                Export section
                <select
                  aria-label="Export section"
                  value={exportSection}
                  onChange={(e) => setExportSection(e.target.value)}
                >
                  <option value="metrics">KPIs and definitions</option>
                  <option value="trends">Trend data</option>
                  <option value="performance">Current performance page</option>
                </select>
              </label>
              <button
                className="btn secondary"
                disabled={loading || !!error}
                onClick={exportCsv}
              >
                Export analytics CSV
              </button>
            </div>
          </>
        )}
      </div>
      {report && (
        <>
          <div className="kpi-grid">
            {report.current.map((m) => {
              const p = report.previous.find((p) => p.key === m.key);
              const change =
                m.value !== null && p?.value !== null && p?.value !== undefined
                  ? p.value === 0
                    ? m.value === 0
                      ? "No change"
                      : "New activity; previous zero"
                    : `${(((m.value - p.value) / Math.abs(p.value)) * 100).toFixed(1)}% vs previous`
                  : "Comparison unavailable";
              return (
                <article className="kpi-card" key={m.key}>
                  <h3>{m.label}</h3>
                  <strong>{formatted(m)}</strong>
                  <small>{m.reason || change}</small>
                  <details>
                    <summary>Definition & comparison</summary>
                    <p>{m.basis}</p>
                    <p>
                      Previous: {p ? formatted(p) : "Data unavailable"}.{" "}
                      {change}.
                    </p>
                    {m.reason && <p>{m.reason}</p>}
                  </details>
                </article>
              );
            })}
          </div>
          <section className="assistant-card">
            <h3>Period trend</h3>
            <div className="assistant-controls">
              <label>
                Trend interval
                <select
                  aria-label="Trend interval"
                  value={query.grain}
                  onChange={(e) => update("grain", e.target.value)}
                >
                  {["day", "week", "month"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Trend measure
                <select
                  aria-label="Trend measure"
                  value={trend}
                  onChange={(e) => setTrend(e.target.value as typeof trend)}
                >
                  <option value="leads">Enquiries received</option>
                  <option value="gbv">Gross booking value</option>
                  <option value="receipts">Manual receipts</option>
                  <option value="refunds">Manual refunds</option>
                </select>
              </label>
            </div>
            <p>
              Week/month buckets include only selected days. Booking value uses
              creation date; manual cash uses transaction date.
            </p>
            <div className="kpi-chart-scroll">
              <div
                className="kpi-bars"
                style={{ minWidth: Math.max(500, report.trends.length * 20) }}
              >
                {report.trends.map((r) => (
                  <button
                    key={r.bucket}
                    className="kpi-bar"
                    style={{ height: Math.max(3, (r[trend] / peak) * 155) }}
                    title={`${r.bucket}: ${trend === "leads" ? r[trend] : inr(r[trend])}`}
                    aria-label={`${r.bucket}: ${trend === "leads" ? r[trend] + " leads" : inr(r[trend])}`}
                    onClick={() => setSelected(r.bucket)}
                  />
                ))}
              </div>
            </div>
            <p role="status">
              {selected
                ? `${selected}: ${trend === "leads" ? report.trends.find((r) => r.bucket === selected)?.leads + " leads" : inr(report.trends.find((r) => r.bucket === selected)?.[trend] || 0)}`
                : "Select a bar for its value. Zero bars mean no recorded event, not verified zero provider activity."}
            </p>
            <details>
              <summary>Accessible trend data</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Leads</th>
                      <th>Gross booking value</th>
                      <th>Manual receipts</th>
                      <th>Manual refunds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.trends.map((r) => (
                      <tr key={r.bucket}>
                        <td>{r.bucket}</td>
                        <td>{r.leads}</td>
                        <td>{inr(r.gbv)}</td>
                        <td>{inr(r.receipts)}</td>
                        <td>{inr(r.refunds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="assistant-card">
            <h3>Performance breakdown</h3>
            <label>
              Group performance by
              <select
                aria-label="Group performance by"
                value={query.breakdown}
                onChange={(e) => update("breakdown", e.target.value)}
              >
                {["destination", "agent", "source", "package"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <p>
              Current assignment/source attribution. Package lead counts use
              distinct enquiries quoted for each package and may overlap across
              packages. Rows ordered by gross booking value. Costs are recorded
              subtotals; contribution requires explicit completeness.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Leads</th>
                    <th>Cohort conversion</th>
                    <th>Bookings created</th>
                    <th>Gross value</th>
                    {report.financial && (
                      <>
                        <th>Recorded direct costs</th>
                        <th>Contribution</th>
                        <th>Margin</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {report.performance.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>{r.leads}</td>
                      <td>
                        {r.conversion === null
                          ? "Data unavailable"
                          : (r.conversion * 100).toFixed(1) + "%"}
                      </td>
                      <td>{r.bookings}</td>
                      <td>{inr(r.gbv)}</td>
                      {report.financial && (
                        <>
                          <td>{inr(r.recordedCosts || 0)}</td>
                          <td>
                            {r.contribution === null
                              ? "Data unavailable"
                              : inr(r.contribution || 0)}
                          </td>
                          <td>
                            {r.margin === null
                              ? "Data unavailable"
                              : ((r.margin || 0) * 100).toFixed(1) + "%"}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.performance.length && (
              <p>
                No permitted records match these filters. Try a different range.
              </p>
            )}
            <div className="assistant-controls">
              <button
                className="btn secondary"
                disabled={loading || +query.page === 0}
                onClick={() => update("page", String(+query.page - 1))}
              >
                Previous performance page
              </button>
              <span>
                Page {report.filters.page + 1} · {report.totalGroups} groups ·
                20 rows per page
              </span>
              <button
                className="btn secondary"
                disabled={
                  loading || (+query.page + 1) * 20 >= report.totalGroups
                }
                onClick={() => update("page", String(+query.page + 1))}
              >
                Next performance page
              </button>
            </div>
          </section>
          {data.actor.role === "OWNER" && (
            <section className="assistant-card">
              <h3>Advertising coverage declaration</h3>
              <p>
                Only attest after checking all manual advertising spend for
                these complete calendar months and selected source. Missing rows
                may legitimately mean zero only when you explicitly certify
                completeness. Changing spend invalidates affected declarations.
                Destination/agent/package filters cannot allocate this spend.
              </p>
              <p>
                Use closed historical calendar months and clear destination,
                agent and package filters before attesting agency/source
                coverage.
              </p>
              <p>
                Current exact-period declaration:{" "}
                {report.coverage.adComplete
                  ? "Complete and eligible for this report"
                  : "Not complete/eligible"}
              </p>
              <button
                className="btn secondary"
                disabled={
                  data.demo ||
                  loading ||
                  coverageBusy ||
                  !fullCalendarMonths(report.period.from, report.period.to) ||
                  report.period.to >= today ||
                  !!report.filters.destination ||
                  !!report.filters.agent ||
                  !!report.filters.package
                }
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Confirm ALL advertising spend for this exact agency/source period has been reconciled, not just a selected destination, agent or package. Missing spend will be treated as zero.",
                    )
                  )
                    return;
                  setCoverageBusy(true);
                  try {
                    const ok = await onChange("ad-coverage", {
                      from: report.period.from,
                      to: report.period.to,
                      source: report.filters.source,
                      complete: true,
                      revision: report.coverage.revision,
                    });
                    if (ok) setRefresh((x) => x + 1);
                    else
                      setError(
                        "Coverage could not be updated. Check full-month dates and account write access.",
                      );
                  } finally {
                    setCoverageBusy(false);
                  }
                }}
              >
                Attest complete advertising coverage
              </button>{" "}
              <button
                className="btn secondary"
                disabled={data.demo || loading || coverageBusy}
                onClick={async () => {
                  setCoverageBusy(true);
                  try {
                    if (
                      await onChange("ad-coverage", {
                        from: report.period.from,
                        to: report.period.to,
                        source: report.filters.source,
                        complete: false,
                        revision: report.coverage.revision,
                      })
                    )
                      setRefresh((x) => x + 1);
                    else setError("Coverage withdrawal failed.");
                  } finally {
                    setCoverageBusy(false);
                  }
                }}
              >
                Withdraw advertising coverage
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
