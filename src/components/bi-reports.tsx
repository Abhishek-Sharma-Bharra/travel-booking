"use client";
import { useEffect, useRef, useState } from "react";
import type { Dataset } from "@/lib/data";
import type { KpiData } from "@/lib/kpi-service";
import { calendarDate } from "@/lib/reporting-time";
import { safeCsv } from "@/lib/validation";
import {
  biQuerySchema,
  biStorageKey,
  cardOptions,
  columnOptions,
  columnLabels,
  columnFormat,
  drillWindow,
  exportBiGroups,
  formatBiValue,
  metricChange,
  readBiViews,
  restrictedKeys,
  viewSchema,
  type BiColumn,
  type BiQuery,
  type BiTrend,
  type BiView,
} from "@/lib/bi";
const defaultCards: (typeof cardOptions)[number][] = [
  "leads",
  "conversion",
  "gbv",
  "receipts",
  "outstanding",
];
const defaultColumns: BiColumn[] = ["leads", "bookings", "conversion", "gbv"];
export default function BiReports({ data }: { data: Dataset }) {
  const today = calendarDate(new Date(), data.agency.timezone);
  const initial = (): BiQuery => ({
    from: today.slice(0, 7) + "-01",
    to: today,
    destination: "",
    source: "",
    agent: "",
    package: "",
    grain: "week",
    breakdown: "source",
    page: "0",
  });
  const [query, setQuery] = useState<BiQuery>(initial),
    [report, setReport] = useState<KpiData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [cards, setCards] = useState<readonly string[]>(defaultCards),
    [columns, setColumns] = useState<BiColumn[]>(defaultColumns),
    [trend, setTrend] = useState<BiTrend>("leads"),
    [chart, setChart] = useState<"bar" | "line">("bar");
  const [views, setViews] = useState<BiView[]>([]),
    [viewId, setViewId] = useState(""),
    [name, setName] = useState(""),
    [notice, setNotice] = useState(""),
    [storageReady, setStorageReady] = useState(false);
  const sequence = useRef(0),
    storage = biStorageKey(data.agency.id, data.actor.id);
  useEffect(() => {
    setStorageReady(false);
    setViewId("");
    setName("");
    try {
      setViews(data.demo ? [] : readBiViews(localStorage.getItem(storage)));
    } catch {
      setViews([]);
      setNotice(
        "Browser storage is unavailable. Reports still work, but views cannot be saved here.",
      );
    }
    setStorageReady(true);
  }, [storage, data.demo]);
  useEffect(() => {
    const controller = new AbortController(),
      id = ++sequence.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const valid = biQuerySchema.safeParse(query);
        if (!valid.success)
          throw Error("Choose valid reporting dates (1–366 days) and filters.");
        const params = new URLSearchParams(query);
        if (data.demo) params.set("demo", "1");
        const response = await fetch("/api/analytics?" + params, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Report unavailable");
        if (id === sequence.current) setReport(result);
      } catch (e) {
        if (!controller.signal.aborted && id === sequence.current)
          setError(
            (e as Error).name === "TimeoutError"
              ? "Report took too long. Shorten the range or retry."
              : (e as Error).message,
          );
      } finally {
        if (!controller.signal.aborted && id === sequence.current)
          setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    query,
    refresh,
    data.demo,
    data.agency.id,
    data.actor.id,
    data.actor.role,
  ]);
  const financial = data.actor.role !== "AGENT" && !!report?.financial;
  const visibleCards = cards.filter(
    (key) => financial || !restrictedKeys.has(key),
  );
  const visibleColumns = columns.filter(
    (key) => financial || !restrictedKeys.has(key),
  );
  function update(key: keyof BiQuery, value: string) {
    setQuery((q) => ({
      ...q,
      [key]: value,
      page: key === "page" ? value : "0",
    }));
  }
  function persist(next: BiView[]) {
    try {
      localStorage.setItem(storage, JSON.stringify(next));
      setViews(next);
      return true;
    } catch {
      setNotice(
        "This browser could not save the view. Existing business records are unchanged.",
      );
      return false;
    }
  }
  function saveView() {
    if (data.demo || !storageReady || loading || error || !report) return;
    const valid = viewSchema.safeParse({
      id: viewId || crypto.randomUUID(),
      name,
      query: { ...query, page: "0" },
      cards: visibleCards,
      columns: visibleColumns,
      trend,
      chart,
    });
    if (!valid.success) {
      setNotice(
        "Enter a report name (up to 60 characters), valid dates, and select at least one metric and table column.",
      );
      return;
    }
    if (!viewId && views.length >= 12) {
      setNotice(
        "This browser already has 12 views. Delete one before saving another.",
      );
      return;
    }
    if (persist([...views.filter((v) => v.id !== valid.data.id), valid.data])) {
      setViewId(valid.data.id);
      setName(valid.data.name);
      setNotice(
        "Report settings saved on this browser. No report results or customer records were stored.",
      );
    }
  }
  function loadView(id: string) {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    setViewId(id);
    setName(view.name);
    setQuery({ ...view.query, page: "0" });
    setCards(
      view.cards.filter(
        (k) => data.actor.role !== "AGENT" || !restrictedKeys.has(k),
      ),
    );
    setColumns(
      view.columns.filter(
        (k) => data.actor.role !== "AGENT" || !restrictedKeys.has(k),
      ),
    );
    setTrend(view.trend);
    setChart(view.chart);
    setNotice(
      "Saved fixed-date settings loaded. Data is fetched again using your current permissions.",
    );
  }
  function exportRows(rows: Record<string, unknown>[], kind: string) {
    if (!report || loading || error) return;
    const url = URL.createObjectURL(
      new Blob([safeCsv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `travelos-bi-${kind}-${report.period.from}-${report.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportMetrics() {
    if (!report) return;
    exportRows(
      report.current
        .filter((m) => visibleCards.includes(m.key))
        .map((m) => ({
          from: report.period.from,
          to: report.period.to,
          timezone: report.timezone,
          asOf: report.asOf,
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
          definition: m.basis,
          reason: m.reason || "",
        })),
      "metrics",
    );
  }
  const shown = !!report && !loading && !error,
    peak = report ? Math.max(1, ...report.trends.map((r) => r[trend])) : 1;
  const points =
    report?.trends
      .map(
        (r, i) =>
          `${report.trends.length === 1 ? 350 : 30 + (i * 640) / (report.trends.length - 1)},${180 - (r[trend] / peak) * 155}`,
      )
      .join(" ") || "";
  const filterLabels = {
    destination: "Destination",
    source: "Source",
    agent: "Agent",
    package: "Package",
  };
  return (
    <section className="bi-reports" aria-busy={loading}>
      <header className="report-workbar">
        <div>
          <span className="report-kicker">REPORT BUILDER</span>
          <h2>Business intelligence reports</h2>
        </div>
        <span className="report-context">Custom views · Agency records</span>
      </header>
      <div className="report-layout">
        <aside
          className="report-filter-rail"
          aria-label="BI report filters and saved views"
        >
          <div className="assistant-card">
            <h3>Filter your report</h3>
            <p>
              Build a view of your agency’s recorded performance. Choose
              metrics, compare periods and filter into a group or date.
            </p>
            <div className="bi-filter-grid">
              <label>
                BI from
                <input
                  type="date"
                  value={query.from}
                  onChange={(e) => update("from", e.target.value)}
                />
              </label>
              <label>
                BI to
                <input
                  type="date"
                  value={query.to}
                  onChange={(e) => update("to", e.target.value)}
                />
              </label>
              {(Object.keys(filterLabels) as (keyof typeof filterLabels)[]).map(
                (key) => (
                  <label key={key}>
                    BI {filterLabels[key]}
                    <select
                      aria-label={`BI ${filterLabels[key]}`}
                      value={query[key]}
                      onChange={(e) => update(key, e.target.value)}
                    >
                      <option value="">
                        All {filterLabels[key].toLowerCase()}s
                      </option>
                      {key === "agent"
                        ? report?.options.agents.map((v) => (
                            <option value={v.id} key={v.id}>
                              {v.name}
                            </option>
                          ))
                        : key === "package"
                          ? report?.options.packages.map((v) => (
                              <option value={v.id} key={v.id}>
                                {v.name}
                              </option>
                            ))
                          : (key === "destination"
                              ? report?.options.destinations
                              : report?.options.sources
                            )?.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </label>
                ),
              )}
            </div>
            <div className="bi-toolbar">
              <button
                className="btn secondary"
                onClick={() => {
                  setQuery(initial());
                  setNotice("");
                }}
              >
                Reset BI filters
              </button>
              <button
                className="btn secondary"
                onClick={() => setRefresh((n) => n + 1)}
              >
                Refresh BI report
              </button>
            </div>
          </div>
          <div className="assistant-card">
            <h3>Save a personal report view</h3>
            <p>
              Saved views keep fixed dates, filters and display settings on this
              browser for your account. They are not shared with your team or
              backed up with the database.
            </p>
            <div className="bi-toolbar">
              <label>
                Saved BI views
                <select
                  aria-label="Saved BI views"
                  value={viewId}
                  onChange={(e) => {
                    if (e.target.value) loadView(e.target.value);
                    else {
                      setViewId("");
                      setName("");
                    }
                  }}
                >
                  <option value="">New view</option>
                  {views.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Report name
                <input
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  disabled={data.demo}
                />
              </label>
              <button
                className="btn secondary"
                disabled={data.demo || !storageReady || loading || !!error}
                onClick={saveView}
              >
                Save BI view
              </button>
              <button
                className="text-button"
                disabled={!viewId || data.demo}
                onClick={() => {
                  if (persist(views.filter((v) => v.id !== viewId))) {
                    setViewId("");
                    setName("");
                    setNotice("Saved view deleted from this browser.");
                  }
                }}
              >
                Delete BI view
              </button>
            </div>
            {data.demo && (
              <p className="method-note">
                Public demo: saving personal views is disabled.
              </p>
            )}
            {notice && (
              <p role="status" className="method-note">
                {notice}
              </p>
            )}
          </div>
        </aside>
        <div className="report-results">
          {loading && <p role="status">Updating BI report…</p>}
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {shown && report && (
            <>
              <p className="method-note" aria-label="BI report period">
                Showing {report.period.from} through {report.period.to} ·{" "}
                {report.timezone}. Compared with {report.previousPeriod.from}{" "}
                through {report.previousPeriod.to}. Equal calendar-day windows;
                today may be partial. As of{" "}
                {new Date(report.asOf).toLocaleString("en-IN", {
                  timeZone: report.timezone,
                })}
                .
              </p>
              <details className="assistant-card">
                <summary>Choose report metrics and columns</summary>
                <h3>Summary metrics (up to 8)</h3>
                <div className="bi-choice-grid">
                  {report.current
                    .filter(
                      (m) =>
                        cardOptions.includes(
                          m.key as (typeof cardOptions)[number],
                        ) &&
                        (financial || !restrictedKeys.has(m.key)),
                    )
                    .map((m) => (
                      <label key={m.key}>
                        <input
                          type="checkbox"
                          checked={visibleCards.includes(m.key)}
                          disabled={
                            !visibleCards.includes(m.key) &&
                            visibleCards.length >= 8
                          }
                          onChange={() =>
                            setCards((c) =>
                              c.includes(m.key)
                                ? c.filter((k) => k !== m.key)
                                : [...c, m.key],
                            )
                          }
                        />
                        {m.label}
                      </label>
                    ))}
                </div>
                <h3>Table columns</h3>
                <div className="bi-choice-grid">
                  {columnOptions
                    .filter((k) => financial || !restrictedKeys.has(k))
                    .map((k) => (
                      <label key={k}>
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(k)}
                          onChange={() =>
                            setColumns((c) =>
                              c.includes(k)
                                ? c.filter((v) => v !== k)
                                : [...c, k],
                            )
                          }
                        />
                        {columnLabels[k]}
                      </label>
                    ))}
                </div>
              </details>
              <div className="bi-summary-grid">
                {report.current
                  .filter((m) => visibleCards.includes(m.key))
                  .map((m) => (
                    <article
                      className="bi-summary"
                      data-availability={
                        m.value === null ? "missing" : "recorded"
                      }
                      key={m.key}
                    >
                      <h3>{m.label}</h3>
                      <strong>{formatBiValue(m.value, m.format)}</strong>
                      <p>
                        Previous:{" "}
                        {formatBiValue(
                          report.previous.find((p) => p.key === m.key)?.value,
                          m.format,
                        )}
                      </p>
                      <small>
                        {metricChange(
                          m,
                          report.previous.find((p) => p.key === m.key),
                        )}
                      </small>
                      <details>
                        <summary>Definition</summary>
                        <p>{m.basis}</p>
                        {m.reason && <p>{m.reason}</p>}
                      </details>
                    </article>
                  ))}
              </div>
              <button
                className="btn secondary"
                disabled={!visibleCards.length}
                onClick={exportMetrics}
              >
                Export BI metrics CSV
              </button>
              <section className="assistant-card">
                <h3>Trend explorer</h3>
                <div className="bi-toolbar">
                  <label>
                    BI trend metric
                    <select
                      aria-label="BI trend metric"
                      value={trend}
                      onChange={(e) => setTrend(e.target.value as BiTrend)}
                    >
                      <option value="leads">Enquiries received</option>
                      <option value="gbv">Gross booking value</option>
                      <option value="receipts">Manual receipts</option>
                      <option value="refunds">Manual refunds</option>
                    </select>
                  </label>
                  <label>
                    BI trend interval
                    <select
                      aria-label="BI trend interval"
                      value={query.grain}
                      onChange={(e) => update("grain", e.target.value)}
                    >
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                    </select>
                  </label>
                  <label>
                    BI chart style
                    <select
                      aria-label="BI chart style"
                      value={chart}
                      onChange={(e) =>
                        setChart(e.target.value as "bar" | "line")
                      }
                    >
                      <option value="bar">Bar chart</option>
                      <option value="line">Line chart</option>
                    </select>
                  </label>
                </div>
                <svg
                  className="bi-chart"
                  viewBox="0 0 700 210"
                  role="img"
                  aria-label={`${chart} chart of ${trend} by ${query.grain}; exact values and date filters are in the table below`}
                >
                  <line x1="30" y1="180" x2="670" y2="180" stroke="#c6cfdd" />
                  {chart === "line" ? (
                    <>
                      <polyline
                        fill="none"
                        stroke="#b65330"
                        strokeWidth="3"
                        points={points}
                      />
                      {report.trends.map((r, i) => (
                        <circle
                          key={r.bucket}
                          cx={
                            report.trends.length === 1
                              ? 350
                              : 30 + (i * 640) / (report.trends.length - 1)
                          }
                          cy={180 - (r[trend] / peak) * 155}
                          r="3"
                          fill="#b65330"
                        />
                      ))}
                    </>
                  ) : (
                    report.trends.map((r, i) => {
                      const width = 640 / Math.max(1, report.trends.length);
                      return (
                        <rect
                          key={r.bucket}
                          x={30 + i * width + width * 0.1}
                          y={180 - (r[trend] / peak) * 155}
                          width={width * 0.8}
                          height={(r[trend] / peak) * 155}
                          fill="#b65330"
                        />
                      );
                    })
                  )}
                </svg>
                <p className="method-note">
                  Chart uses{" "}
                  {trend === "leads" ? "enquiry counts" : "INR amounts"}.
                  Booking value uses booking creation dates; receipts/refunds
                  use recorded ledger dates. Zero means no recorded event, not
                  provider verification.
                </p>
                <details>
                  <summary>Trend data and date drill-down</summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Bucket start</th>
                          <th>
                            {trend === "leads" ? "Enquiries" : "Amount (INR)"}
                          </th>
                          <th>Explore</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.trends.map((r) => (
                          <tr key={r.bucket}>
                            <td>{r.bucket}</td>
                            <td>
                              {formatBiValue(
                                r[trend],
                                trend === "leads" ? "count" : "money",
                              )}
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setQuery((q) => ({
                                    ...q,
                                    ...drillWindow(
                                      report.period,
                                      r.bucket,
                                      report.filters.grain,
                                    ),
                                    page: "0",
                                  }))
                                }
                              >
                                Filter period {r.bucket}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <button
                  className="btn secondary"
                  onClick={() =>
                    exportRows(
                      report.trends.map((r) => ({
                        from: report.period.from,
                        to: report.period.to,
                        timezone: report.timezone,
                        bucket: r.bucket,
                        metric: trend,
                        value: r[trend],
                        unit: trend === "leads" ? "count" : "INR paise",
                      })),
                      "trends",
                    )
                  }
                >
                  Export BI trend CSV
                </button>
              </section>
              <section className="assistant-card">
                <h3>Group report</h3>
                <div className="bi-toolbar">
                  <label>
                    BI group by
                    <select
                      aria-label="BI group by"
                      value={query.breakdown}
                      onChange={(e) => update("breakdown", e.target.value)}
                    >
                      <option value="destination">Destination</option>
                      <option value="source">Source</option>
                      <option value="agent">Agent</option>
                      <option value="package">Package</option>
                    </select>
                  </label>
                  <button
                    className="btn secondary"
                    disabled={
                      !report.performance.length || !visibleColumns.length
                    }
                    onClick={() =>
                      exportRows(
                        exportBiGroups(report, visibleColumns),
                        "groups-page",
                      )
                    }
                  >
                    Export this BI table page
                  </button>
                </div>
                <p className="method-note">
                  Click a group to filter the report. Enquiries use their own
                  date cohort; bookings use creation dates. Package enquiry
                  counts can overlap across packages. Recorded costs are not
                  necessarily complete; contribution is not net profit.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Group</th>
                        {visibleColumns.map((k) => (
                          <th key={k}>{columnLabels[k]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.performance.map((r) => (
                        <tr key={r.key}>
                          <td>
                            {r.key ? (
                              <button
                                className="text-button"
                                onClick={() =>
                                  update(report.filters.breakdown, r.key)
                                }
                                aria-label={`Filter ${report.filters.breakdown}: ${r.label}`}
                              >
                                {r.label}
                              </button>
                            ) : (
                              r.label
                            )}
                          </td>
                          {visibleColumns.map((k) => (
                            <td key={k}>
                              {formatBiValue(r[k], columnFormat(k))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!report.performance.length && (
                  <p>No groups match these filters.</p>
                )}
                <div className="bi-toolbar">
                  <button
                    className="btn secondary"
                    disabled={report.filters.page === 0}
                    onClick={() =>
                      update("page", String(report.filters.page - 1))
                    }
                  >
                    Previous BI page
                  </button>
                  <span>
                    Page {report.filters.page + 1} · {report.totalGroups} groups
                    · 20 rows per page
                  </span>
                  <button
                    className="btn secondary"
                    disabled={
                      (report.filters.page + 1) * 20 >= report.totalGroups
                    }
                    onClick={() =>
                      update("page", String(report.filters.page + 1))
                    }
                  >
                    Next BI page
                  </button>
                </div>
              </section>
              <p className="method-note">
                Saved views contain settings only. Data is requested from the
                server with your current agency and role. Verified collections,
                recognized revenue and net profit remain unavailable until their
                required data exists.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
