"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import SecuritySettings from "./security-settings";
import {
  Compass,
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Plane,
  Wallet,
  Megaphone,
  BarChart3,
  Sparkles,
  Settings,
  BookOpen,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  List,
  Columns3,
  LogOut,
  Menu,
  CheckCircle2,
  Clock3,
  X,
  Printer,
  Upload,
  Filter,
  CalendarDays,
} from "lucide-react";
import Papa from "papaparse";
import type { Dataset } from "@/lib/data";
import { analyse, defaultFilters, Filters } from "@/lib/analytics";
import { inr, indianDate, balances, indiaToday } from "@/lib/money";
import { leadSchema, sources, stages } from "@/lib/validation";
import { modelInfo, predict } from "@/lib/model";
import { authClient } from "@/lib/auth-client";
import {
  Field,
  Fields,
  Modal,
  Empty,
  Badge,
  ExportButton,
  MiniBars,
} from "./ui";
type Lead = Dataset["leads"][number];
type Booking = Dataset["bookings"][number];
type Quote = Dataset["quotes"][number];
const navigation = [
  {
    group: "WORKSPACE",
    items: [
      ["Overview", LayoutDashboard],
      ["Enquiries", Users],
      ["Packages", Package],
      ["Quotations", FileText],
      ["Bookings", Plane],
      ["Transactions", Wallet],
    ],
  },
  {
    group: "GROWTH & INSIGHTS",
    items: [
      ["Marketing", Megaphone],
      ["Monthly report", BarChart3],
      ["Lead intelligence", Sparkles],
    ],
  },
  {
    group: "AGENCY",
    items: [
      ["Settings", Settings],
      ["Demo guide", BookOpen],
    ],
  },
] as const;
const subtitles: Record<string, string> = {
  Overview:
    "A clearer view of your agency. Every enquiry, every journey, every rupee.",
  Enquiries: "Good journeys start with a conversation. Keep yours moving.",
  Packages: "Thoughtfully planned journeys, ready to quote.",
  Quotations: "From a great conversation to a considered proposal.",
  Bookings: "Every confirmed journey, with the details that matter.",
  Transactions:
    "Receipts, refunds and supplier costs. A transparent manual ledger.",
  Marketing: "Know where your next journey begins.",
  "Monthly report":
    "Your month in focus. Numbers, observations and next steps.",
  "Lead intelligence": "A little more context for your next conversation.",
  Settings: "Make this workspace yours.",
  "Demo guide": "A simple path through Vashisht TravelOS.",
};
const options = (values: readonly string[]) =>
  values.map((value) => ({ value, label: value }));
const today = indiaToday;
const numField = (name: string, label: string): Field => ({
  name,
  label,
  type: "number",
  min: 0,
  step: "0.01",
});
const moneyInput = (v: number) => String(v / 100);
export default function Workspace({ initial }: { initial: Dataset }) {
  const [data, setData] = useState(initial),
    [page, setPage] = useState("Overview"),
    [filters, setFilters] = useState<Filters>(defaultFilters),
    [menu, setMenu] = useState(false),
    [view, setView] = useState("list"),
    [exportTable, setExportTable] = useState("Enquiries"),
    [stage, setStage] = useState(""),
    [pageIndex, setPageIndex] = useState(0),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const [form, setForm] = useState<{
    title: string;
    action: string;
    fields: Field[];
    values?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  } | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null),
    [printQuote, setPrintQuote] = useState<Quote | null>(null),
    [printReport, setPrintReport] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [importRows, setImportRows] = useState<Record<string, string>[]>([]),
    [importErrors, setImportErrors] = useState<string[]>([]),
    [reportMonth, setReportMonth] = useState(() =>
      new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 0),
      )
        .toISOString()
        .slice(0, 7),
    ),
    [calc, setCalc] = useState(["1", "30", "2", "4", "false", "true"]);
  const manager = data.actor.role !== "AGENT",
    owner = data.actor.role === "OWNER";
  const a = useMemo(() => analyse(data, filters), [data, filters]);
  const userName = (id: string) =>
    data.users.find((u) => u.id === id)?.name ?? "Team member";
  const lead = (id: string) => data.leads.find((l) => l.id === id);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 6000);
  };
  function changePage(p: string) {
    setPage(p);
    setPageIndex(0);
    setMenu(false);
    if (p !== "Enquiries") setFilters((f) => ({ ...f, search: "" }));
  }
  function openForm(
    title: string,
    action: string,
    fields: Field[],
    values: Record<string, unknown> = {},
    extra: Record<string, unknown> = {},
  ) {
    setFormError("");
    setForm({
      title,
      action,
      fields,
      values,
      extra: {
        ...extra,
        ...(action === "transaction" ? { requestId: crypto.randomUUID() } : {}),
      },
    });
  }
  async function run(action: string, input: Record<string, unknown>) {
    if (data.demo) {
      setFormError(
        "This demo is read-only. Create an agency workspace to save your own records.",
      );
      return false;
    }
    setBusy(true);
    setFormError("");
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      const reload = await fetch("/api/data", { cache: "no-store" });
      if (!reload.ok)
        throw new Error("Your session expired. Please sign in again.");
      setData(await reload.json());
      notify(result.message);
      return true;
    } catch (e) {
      setFormError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function enquiryForm(l?: Lead) {
    const fields: Field[] = [
      { name: "externalId", label: "Lead / external ID" },
      { name: "customer", label: "Customer name" },
      {
        name: "email",
        label: "Email (optional)",
        type: "email",
        required: false,
      },
      { name: "phone", label: "Phone (optional)", required: false },
      { name: "destination", label: "Destination" },
      { name: "enquiryDate", label: "Enquiry date", type: "date" },
      { name: "travelStart", label: "Travel start", type: "date" },
      { name: "travelEnd", label: "Travel end", type: "date" },
      {
        name: "travellers",
        label: "Travellers",
        type: "number",
        min: 1,
        max: 100,
      },
      numField("budget", "Budget / person (₹)"),
      numField("quotedPrice", "Quoted price / person (₹)"),
      { name: "source", label: "Lead source", options: options(sources) },
      {
        name: "assignedId",
        label: "Assigned to",
        options: data.users
          .filter((u) => !u.disabled && (manager || u.id === data.actor.id))
          .map((u) => ({ value: u.id, label: u.name })),
      },
      {
        name: "stage",
        label: "Stage",
        options: options(
          l?.stage === "Won" ? ["Won"] : stages.filter((s) => s !== "Won"),
        ),
      },
      {
        name: "followUp",
        label: "Next follow-up",
        type: "date",
        required: false,
      },
      {
        name: "lostReason",
        label: "Lost reason (required when Lost)",
        required: false,
      },
      {
        name: "firstResponseHours",
        label: "First response hours",
        type: "number",
        min: 0,
        max: 1000,
        step: "0.1",
        required: false,
        hint: "Leave blank until a first response has occurred.",
      },
      {
        name: "repeatCustomer",
        label: "Repeat customer",
        options: [
          { value: "", label: "Unknown" },
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ],
        required: false,
      },
      {
        name: "itineraryRequested",
        label: "Itinerary requested",
        options: [
          { value: "", label: "Unknown" },
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ],
        required: false,
      },
      { name: "notes", label: "Notes", type: "textarea", required: false },
    ];
    const values: Record<string, unknown> = l
      ? {
          ...l,
          budget: moneyInput(l.budget),
          quotedPrice: moneyInput(l.quotedPrice),
          enquiryDate: l.enquiryDate.slice(0, 10),
          travelStart: l.travelStart.slice(0, 10),
          travelEnd: l.travelEnd.slice(0, 10),
          followUp: l.followUp?.slice(0, 10) ?? "",
          repeatCustomer:
            l.repeatCustomer === null ? "" : String(l.repeatCustomer),
          itineraryRequested:
            l.itineraryRequested === null ? "" : String(l.itineraryRequested),
        }
      : {
          externalId: `LEAD-${Date.now().toString().slice(-8)}`,
          enquiryDate: today(),
          travellers: 2,
          budget: "0",
          quotedPrice: "0",
          source: "WhatsApp",
          assignedId: manager
            ? data.users.find((u) => !u.disabled)?.id
            : data.actor.id,
          stage: "New",
        };
    setDetail(null);
    openForm(
      l ? "Edit enquiry" : "New enquiry",
      "lead",
      fields,
      values,
      l ? { id: l.id } : {},
    );
  }
  function quotationForm(l?: Lead) {
    openForm(
      "Build a quotation",
      "quote",
      [
        {
          name: "leadId",
          label: "Enquiry",
          options: data.leads
            .filter((x) => !["Won", "Lost"].includes(x.stage))
            .map((x) => ({
              value: x.id,
              label: `${x.externalId} · ${x.customer}`,
            })),
        },
        {
          name: "packageId",
          label: "Package",
          options: data.packages.map((p) => ({
            value: p.id,
            label: `${p.name} · ${inr(p.price)} / person`,
          })),
        },
        numField("discount", "Discount on subtotal (₹)"),
        { ...numField("tax", "Optional tax (%)"), max: 100 },
      ],
      { leadId: l?.id, discount: "0", tax: "0" },
    );
    setDetail(null);
  }
  function packageForm(p?: Dataset["packages"][number]) {
    openForm(
      p ? "Edit package" : "New package",
      "package",
      [
        { name: "name", label: "Package name" },
        { name: "destination", label: "Destination" },
        {
          name: "days",
          label: "Duration (days)",
          type: "number",
          min: 1,
          max: 365,
        },
        numField("price", "Selling price / person (₹)"),
        numField("estimatedCost", "Estimated supplier cost / person (₹)"),
        { name: "inclusions", label: "Inclusions", type: "textarea" },
        { name: "exclusions", label: "Exclusions", type: "textarea" },
      ],
      p
        ? {
            ...p,
            price: moneyInput(p.price),
            estimatedCost: moneyInput(p.estimatedCost),
          }
        : { days: 5 },
      p ? { id: p.id } : {},
    );
  }
  function transactionForm(b?: Booking) {
    openForm(
      "Record a manual transaction",
      "transaction",
      [
        {
          name: "bookingId",
          label: "Booking",
          options: data.bookings.map((x) => ({
            value: x.id,
            label: `${lead(x.leadId)?.customer} · ${x.id.slice(-8)}`,
          })),
        },
        {
          name: "kind",
          label: "Transaction type",
          options: options(
            manager
              ? [
                  "Receipt",
                  "Refund",
                  "Expense",
                  "Supplier payment",
                  "Supplier credit",
                  "Supplier refund",
                ]
              : ["Receipt", "Refund"],
          ),
        },
        numField("amount", "Amount (₹)"),
        {
          name: "supplier",
          label: "Supplier (required for supplier entries)",
          required: false,
          hint: "Use the same supplier name as the expense.",
        },
        { name: "date", label: "Transaction date", type: "date" },
        {
          name: "dueDate",
          label: "Expense due date (optional)",
          type: "date",
          required: false,
        },
        { name: "memo", label: "Reference / reason", type: "textarea" },
      ],
      { bookingId: b?.id, date: today(), kind: "Receipt" },
    );
  }
  const filteredLeads = a.leads.filter((l) => !stage || l.stage === stage),
    pageLeads = filteredLeads.slice(pageIndex * 20, pageIndex * 20 + 20);
  const dateFilter = (v: Partial<Filters>) => {
    setFilters({ ...filters, ...v });
    setPageIndex(0);
  };
  const reportFilters = (month: string): Filters => {
    const [y, m] = month.split("-").map(Number);
    return {
      ...filters,
      from: `${month}-01`,
      to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
      search: "",
    };
  };
  const report = analyse(data, reportFilters(reportMonth));
  const [ry, rm] = reportMonth.split("-").map(Number);
  const prevMonth = new Date(Date.UTC(ry, rm - 2, 1)).toISOString().slice(0, 7),
    prev = analyse(data, reportFilters(prevMonth));
  const hasPrevious = data.leads.some((l) =>
    l.enquiryDate.startsWith(prevMonth),
  );
  async function csvFile(file: File) {
    setImportRows([]);
    setImportErrors([]);
    if (file.size > 1_500_000) {
      setImportErrors(["CSV must be smaller than 1.5 MB."]);
      return;
    }
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    if (parsed.data.length > 500) {
      setImportErrors(["Maximum 500 enquiries per import."]);
      return;
    }
    const rows = parsed.data;
    const errors = parsed.errors.map(
      (e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`,
    );
    const seen = new Set(data.leads.map((l) => l.externalId));
    rows.forEach((r, i) => {
      const test = leadSchema.safeParse(r);
      if (!test.success)
        errors.push(
          `Row ${i + 2}: ${test.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
        );
      if (seen.has(r.externalId))
        errors.push(`Row ${i + 2}: duplicate externalId ${r.externalId}`);
      seen.add(r.externalId);
      if (["Won", "Quoted"].includes(r.stage))
        errors.push(
          `Row ${i + 2}: import new enquiries; build quotations in the app.`,
        );
      if (!data.users.some((u) => u.id === r.assignedId && !u.disabled))
        errors.push(
          `Row ${i + 2}: assignedId must match an active team member.`,
        );
    });
    setImportRows(rows);
    setImportErrors(errors);
  }
  const exportTables: Record<string, Record<string, unknown>[]> = {
    Enquiries: data.leads,
    Packages: data.packages,
    Quotations: data.quotes,
    Bookings: data.bookings,
    Transactions: data.bookings.flatMap((b) => b.transactions),
    Spend: data.spends,
    Audit: data.activities,
  };
  const workspaceExport = (exportTables[exportTable] ?? []).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === "object" && v !== null ? JSON.stringify(v) : v,
      ]),
    ),
  );
  const summaryExport = a.leads.map((l) => ({
    leadId: l.externalId,
    customer: l.customer,
    destination: l.destination,
    enquiryDate: l.enquiryDate.slice(0, 10),
    travelStart: l.travelStart.slice(0, 10),
    travelEnd: l.travelEnd.slice(0, 10),
    travellers: l.travellers,
    budgetINR: l.budget / 100,
    quotedPriceINR: l.quotedPrice / 100,
    source: l.source,
    salesperson: userName(l.assignedId),
    stage: l.stage,
    followUp: l.followUp?.slice(0, 10) ?? "",
    lostReason: l.lostReason,
    notes: l.notes,
  }));
  function reportContent() {
    return (
      <div className="report-content">
        <div className="report-brand">
          <Compass size={28} />
          <div>
            <strong>{data.agency.name}</strong>
            <small>
              Monthly value report · {reportMonth} · Generated{" "}
              {indianDate(new Date())}
            </small>
          </div>
        </div>
        <p className="muted">
          {filters.destination || "All destinations"} ·{" "}
          {filters.source || "All sources"} ·{" "}
          {filters.salesperson
            ? userName(filters.salesperson)
            : "All salespeople"}
        </p>
        <div className="metric-grid report-metrics">
          {[
            ["Enquiries", String(report.leads.length)],
            ["Active bookings", String(report.valid.length)],
            ["Net cash collected", inr(report.collected)],
            ["Customer balance", inr(report.due)],
            ["Booking contribution", inr(report.contribution)],
            ["Follow-ups completed", String(report.completedFollowups)],
          ].map(([label, value]) => (
            <div className="metric" key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="info-box">
          Advertising spend: {inr(report.adSpend)} · Agency operating expenses:{" "}
          {inr(report.ops)}. Both are separate from booking contribution.
        </div>
        <br />
        <div className="report-columns">
          <section className="panel">
            <h3>Sales funnel</h3>
            <MiniBars
              items={stages.map((s) => ({
                label: s,
                value: report.leads.filter((l) => l.stage === s).length,
              }))}
            />
          </section>
          <section className="panel">
            <h3>What the numbers suggest</h3>
            <ul className="observations">
              <li>
                {report.overdue.length} currently overdue follow-ups match these
                source, destination and salesperson filters. Review the oldest
                open conversations first.
              </li>
              <li>
                {inr(report.due)} remains due on this month’s booking cohort.
                Confirm payment dates with customers.
              </li>
              <li>
                {report.sourceStats.some((s) => s.enquiries)
                  ? `${[...report.sourceStats].sort((a, b) => b.enquiries - a.enquiries)[0].source} generated the most enquiries in this selection. Compare acquisition costs before changing spend.`
                  : "Record lead sources to begin comparing acquisition channels."}
              </li>
              <li>
                {hasPrevious
                  ? `Enquiries: ${report.leads.length} vs ${prev.leads.length} in ${prevMonth}; net collections: ${inr(report.collected)} vs ${inr(prev.collected)}. This comparison does not establish a cause.`
                  : "No previous-month enquiry data is available for comparison."}
              </li>
            </ul>
          </section>
        </div>
        <section className="panel">
          <h3>Source performance</h3>
          {sourceTable(report.sourceStats)}
        </section>
        <section className="panel">
          <h3>Package contribution</h3>
          {packageTable(report.packages)}
        </section>
        <p className="method-note">
          Bookings are grouped by creation month; collections use transaction
          dates. Balances, stages, contribution and cancellations show the
          current state of that cohort, not a historical month-end accounting
          snapshot. Overdue balances:{" "}
          {inr(
            report.bookings
              .filter((b) => b.dueDate.slice(0, 10) < today())
              .reduce((s, b) => s + balances(b).customerDue, 0),
          )}
          . Follow-ups completed counts logged completion events, not unique
          leads. Marketing and operating expenses are separate from
          contribution. No causal claims are made.
        </p>
      </div>
    );
  }
  function sourceTable(rows: typeof a.sourceStats) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Enquiries</th>
              <th>Bookings¹</th>
              <th>Ad spend</th>
              <th>CPL</th>
              <th>Cost / booking</th>
              <th>ROAS¹</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.source}>
                <td>
                  <span className="source-dot" />
                  {s.source}
                </td>
                <td>{s.enquiries}</td>
                <td>{s.bookings}</td>
                <td>{inr(s.spend)}</td>
                <td>{s.cpl === null ? "—" : inr(s.cpl)}</td>
                <td>{s.cac === null ? "—" : inr(s.cac)}</td>
                <td>{s.roas === null ? "—" : s.roas.toFixed(2) + "×"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  function packageTable(rows: typeof a.packages) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Package / destination</th>
              <th>Bookings</th>
              <th>Booked value²</th>
              <th>Actual supplier costs</th>
              <th>Contribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.name}>
                <td>
                  <strong>{p.name}</strong>
                  <small>{p.destination}</small>
                </td>
                <td>{p.bookings}</td>
                <td>{inr(p.sales)}</td>
                <td>{inr(p.cost)}</td>
                <td className={p.contribution < 0 ? "negative" : "positive"}>
                  {inr(p.contribution)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const chartMax = Math.max(...a.monthly.map((m) => m.sales), 1);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Link href="/" className="brand">
          <Compass size={34} />
          <span>
            vashisht<span className="brand-sub">TRAVELOS</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="agency-avatar">{data.agency.name.charAt(0)}</span>
          <div>
            <strong>
              {data.demo ? "Evergreen Holidays" : data.agency.name}
            </strong>
            <small>
              {data.demo ? "DEMO WORKSPACE" : data.agency.plan + " workspace"}
            </small>
          </div>
        </div>
        <nav>
          {navigation.map((g) => (
            <div key={g.group}>
              <p className="nav-group">{g.group}</p>
              {g.items
                .filter(([name]) => name !== "Marketing" || manager)
                .map(([name, Icon]) => (
                  <button
                    key={name}
                    onClick={() => changePage(name)}
                    className={page === name ? "nav-item active" : "nav-item"}
                  >
                    <Icon size={18} />
                    <span>{name}</span>
                    {name === "Enquiries" && (
                      <small>{data.leads.length.toLocaleString("en-IN")}</small>
                    )}
                    {page === name && <span className="nav-active-dot" />}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="eyebrow">A BETTER WAY TO TRAVEL</span>
            <p>
              Your next great journey
              <br />
              starts with a clear view.
            </p>
            <button
              className="text-button"
              onClick={() => changePage("Demo guide")}
            >
              Explore the workspace <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="user-box">
            <span className="user-avatar">
              {data.demo
                ? "DV"
                : userName(data.actor.id)
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
            </span>
            <div>
              <strong>
                {data.demo ? "Demo visitor" : userName(data.actor.id)}
              </strong>
              <small>
                {data.demo ? "Read-only access" : data.actor.role.toLowerCase()}
              </small>
            </div>
            {data.demo ? (
              <Link href="/login" aria-label="Sign in">
                <ArrowUpRight size={18} />
              </Link>
            ) : (
              <button
                aria-label="Sign out"
                className="icon-button"
                onClick={async () => {
                  await authClient.signOut();
                  location.href = "/";
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              <CalendarDays size={15} />
              {indianDate(new Date())}
            </span>
            <span className="vertical-rule" />
            <span className="top-pill">
              <span className="live-dot" />
              {data.demo ? "Demo environment" : "Agency workspace"}
            </span>
          </div>
        </header>
        {data.demo && (
          <div className="demo-banner">
            <span>
              <Sparkles size={15} />
              <strong>You’re exploring the demo.</strong>
              <span>Fictional data. Read-only. All the possibilities.</span>
            </span>
            <Link href="/login?signup=1">
              Create your workspace <ArrowRight size={15} />
            </Link>
          </div>
        )}
        <div className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "Overview"
                  ? "YOUR BUSINESS, AT A GLANCE"
                  : page === "Lead intelligence"
                    ? "THOUGHTFUL TECHNOLOGY"
                    : "VASHISHT TRAVELOS"}
              </span>
              <h1>
                {page === "Overview" ? "Every journey starts here." : page}
              </h1>
              <p>{subtitles[page]}</p>
            </div>
            <div className="heading-actions">
              {page === "Overview" && (
                <>
                  <ExportButton rows={summaryExport} />
                  <button className="btn primary" onClick={() => enquiryForm()}>
                    <Plus size={17} />
                    New enquiry
                  </button>
                </>
              )}
              {page === "Enquiries" && (
                <>
                  <button
                    className="btn secondary"
                    onClick={() => {
                      setImportOpen(true);
                      setImportRows([]);
                      setImportErrors([]);
                      setFormError("");
                    }}
                  >
                    <Upload size={16} />
                    Import CSV
                  </button>
                  <button className="btn primary" onClick={() => enquiryForm()}>
                    <Plus size={17} />
                    New enquiry
                  </button>
                </>
              )}
              {page === "Packages" && manager && (
                <button className="btn primary" onClick={() => packageForm()}>
                  <Plus size={17} />
                  New package
                </button>
              )}
              {page === "Quotations" && (
                <button className="btn primary" onClick={() => quotationForm()}>
                  <Plus size={17} />
                  Build quotation
                </button>
              )}
              {page === "Transactions" && (
                <button
                  className="btn primary"
                  onClick={() => transactionForm()}
                >
                  <Plus size={17} />
                  Record transaction
                </button>
              )}
            </div>
          </div>
          {![
            "Settings",
            "Demo guide",
            "Lead intelligence",
            "Packages",
          ].includes(page) && (
            <div className="filter-bar">
              <span className="filter-title">
                <Filter size={15} />
                Filters
              </span>
              {page !== "Monthly report" ? (
                <div className="date-range">
                  <input
                    aria-label="From date"
                    type="date"
                    value={filters.from}
                    onChange={(e) => dateFilter({ from: e.target.value })}
                  />
                  <span>—</span>
                  <input
                    aria-label="To date"
                    type="date"
                    value={filters.to}
                    onChange={(e) => dateFilter({ to: e.target.value })}
                  />
                </div>
              ) : (
                <input
                  aria-label="Report month"
                  type="month"
                  value={reportMonth}
                  onChange={(e) => {
                    if (e.target.value) setReportMonth(e.target.value);
                  }}
                />
              )}
              <select
                aria-label="Destination filter"
                value={filters.destination}
                onChange={(e) => dateFilter({ destination: e.target.value })}
              >
                <option value="">All destinations</option>
                {[...new Set(data.leads.map((l) => l.destination))]
                  .sort()
                  .map((d) => (
                    <option key={d}>{d}</option>
                  ))}
              </select>
              <select
                aria-label="Source filter"
                value={filters.source}
                onChange={(e) => dateFilter({ source: e.target.value })}
              >
                <option value="">All sources</option>
                {sources.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                aria-label="Salesperson filter"
                value={filters.salesperson}
                onChange={(e) => dateFilter({ salesperson: e.target.value })}
              >
                <option value="">All salespeople</option>
                {data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                className="text-button reset"
                onClick={() => {
                  setFilters(defaultFilters());
                  setStage("");
                  setPageIndex(0);
                }}
              >
                Reset
              </button>
            </div>
          )}
          {filters.from > filters.to && (
            <p className="error-box" role="alert">
              The start date must be before the end date.
            </p>
          )}
          {page === "Overview" && (
            <>
              <div className="section-label">
                <span>PERFORMANCE SNAPSHOT</span>
                <span>
                  <span className="live-dot" /> Current booking balances · INR
                </span>
              </div>
              <div className="metric-grid">
                {[
                  {
                    label: "Total enquiries",
                    value: a.leads.length.toLocaleString("en-IN"),
                    detail: "Enquiries received in this period",
                    icon: Users,
                  },
                  {
                    label: "Active bookings",
                    value: a.valid.length.toLocaleString("en-IN"),
                    detail: `${a.bookings.length - a.valid.length} cancellations tracked separately`,
                    icon: Plane,
                  },
                  {
                    label: "Booked sales value",
                    value: inr(a.sales),
                    detail: "Includes retained cancellation fees",
                    icon: Wallet,
                  },
                  {
                    label: "Enquiry conversion",
                    value: (a.conversion * 100).toFixed(1) + "%",
                    detail: "Selected enquiry cohort → active bookings",
                    icon: ArrowUpRight,
                  },
                ].map((m, i) => (
                  <article
                    className={`metric ${i === 2 ? "highlight" : ""}`}
                    key={m.label}
                  >
                    <div className="metric-top">
                      <span>{m.label}</span>
                      <m.icon size={18} />
                    </div>
                    <strong>{m.value}</strong>
                    <small>{m.detail}</small>
                  </article>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel sales-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>A little perspective on growth</h2>
                      <p>
                        Booked value and contribution by booking creation month
                      </p>
                    </div>
                    <span className="subtle-tag">INR</span>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i />
                      Booked sales value
                    </span>
                    <span>
                      <i className="gold-dot" />
                      Booking contribution
                    </span>
                  </div>
                  {a.monthly.length ? (
                    <div className="sales-chart">
                      <div className="chart-y">
                        <span>{inr(chartMax)}</span>
                        <span>{inr(chartMax / 2)}</span>
                        <span>₹0</span>
                      </div>
                      <div className="chart-plot">
                        <div className="grid-lines">
                          <i />
                          <i />
                          <i />
                        </div>
                        {a.monthly.map((m) => (
                          <div className="chart-column" key={m.month}>
                            <div className="bar-pair">
                              <div
                                title={`${m.month}: ${inr(m.sales)} booked`}
                                style={{
                                  height: `${Math.max(1, (m.sales / chartMax) * 100)}%`,
                                }}
                              />
                              <div
                                title={`${m.month}: ${inr(m.contribution)} contribution`}
                                className="contribution-bar"
                                style={{
                                  height: `${Math.max(1, (m.contribution / chartMax) * 100)}%`,
                                }}
                              />
                            </div>
                            <span>
                              {new Date(m.month + "-02").toLocaleDateString(
                                "en-IN",
                                { month: "short" },
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Empty
                      title="Your story starts here"
                      detail="Create an enquiry and convert a quotation into your first booking."
                    />
                  )}
                  <div className="chart-footer">
                    <span>
                      Contribution before marketing & operating expenses
                    </span>
                    <strong>{inr(a.contribution)}</strong>
                  </div>
                </section>
                <section className="panel funnel-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Conversations to journeys</h2>
                      <p>Your selected enquiry cohort, by current stage</p>
                    </div>
                  </div>
                  <MiniBars
                    items={stages.map((s) => ({
                      label: s,
                      value: a.leads.filter((l) => l.stage === s).length,
                    }))}
                  />
                  <button
                    className="text-button"
                    onClick={() => changePage("Enquiries")}
                  >
                    Open sales pipeline <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              <div className="secondary-metrics">
                <div>
                  <span className="icon-box">
                    <Wallet size={20} />
                  </span>
                  <div>
                    <small>Net cash collected</small>
                    <strong>{inr(a.collected)}</strong>
                    <span>Receipts less refunds, by transaction date</span>
                  </div>
                </div>
                <div>
                  <span className="icon-box gold">
                    <Clock3 size={20} />
                  </span>
                  <div>
                    <small>Outstanding customer balances</small>
                    <strong>{inr(a.due)}</strong>
                    <span>Current amount due on selected bookings</span>
                  </div>
                </div>
                <div>
                  <span className="icon-box rose">
                    <CalendarDays size={20} />
                  </span>
                  <div>
                    <small>Follow-ups needing attention</small>
                    <strong>{a.overdue.length}</strong>
                    <button
                      className="text-button"
                      onClick={() => {
                        changePage("Enquiries");
                        setFilters({
                          ...filters,
                          from: "2000-01-01",
                          to: today(),
                        });
                        setStage("");
                      }}
                    >
                      Review open enquiries <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Where your travellers want to go</h2>
                      <p>Enquiries by destination</p>
                    </div>
                    <Compass size={20} className="muted" />
                  </div>
                  <MiniBars
                    items={[...new Set(a.leads.map((l) => l.destination))]
                      .map((d) => ({
                        label: d,
                        value: a.leads.filter((l) => l.destination === d)
                          .length,
                      }))
                      .sort((x, y) => y.value - x.value)
                      .slice(0, 6)}
                  />
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>The next conversation matters</h2>
                      <p>Oldest overdue follow-ups · all dates</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => changePage("Enquiries")}
                    >
                      View all <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {a.overdue.length ? (
                    <div className="followup-list">
                      {[...a.overdue]
                        .sort((x, y) =>
                          (x.followUp ?? "").localeCompare(y.followUp ?? ""),
                        )
                        .slice(0, 4)
                        .map((l) => (
                          <button key={l.id} onClick={() => setDetail(l)}>
                            <span className="traveller-avatar">
                              {l.customer
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <div>
                              <strong>{l.customer}</strong>
                              <small>
                                {l.destination} · {userName(l.assignedId)}
                              </small>
                            </div>
                            <span className="due-tag">
                              {indianDate(l.followUp!)}
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <Empty
                      title="All caught up"
                      detail="There are no overdue follow-ups in this selection."
                    />
                  )}
                </section>
              </div>
            </>
          )}
          {page === "Enquiries" && (
            <>
              <div className="panel toolbar">
                <div className="search-input">
                  <Search size={16} />
                  <input
                    aria-label="Search enquiries"
                    placeholder="Search customer, lead ID or destination…"
                    value={filters.search}
                    onChange={(e) => dateFilter({ search: e.target.value })}
                  />
                </div>
                <select
                  aria-label="Stage filter"
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value);
                    setPageIndex(0);
                  }}
                >
                  <option value="">All stages</option>
                  {stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <div className="view-toggle">
                  <button
                    aria-label="List view"
                    className={view === "list" ? "selected" : ""}
                    onClick={() => setView("list")}
                  >
                    <List size={17} />
                  </button>
                  <button
                    aria-label="Pipeline view"
                    className={view === "pipeline" ? "selected" : ""}
                    onClick={() => setView("pipeline")}
                  >
                    <Columns3 size={17} />
                  </button>
                </div>
                <ExportButton
                  rows={summaryExport.filter(
                    (r) => !stage || r.stage === stage,
                  )}
                  name="enquiries"
                />
              </div>
              {!filteredLeads.length ? (
                <Empty
                  title="No enquiries in this view"
                  detail="Try a wider date range or add your first enquiry."
                >
                  <button className="btn primary" onClick={() => enquiryForm()}>
                    New enquiry
                  </button>
                </Empty>
              ) : view === "pipeline" ? (
                <div className="pipeline">
                  {stages
                    .filter((s) => !stage || s === stage)
                    .map((s) => (
                      <section key={s}>
                        <div className="pipeline-title">
                          <Badge value={s} />
                          <strong>
                            {filteredLeads.filter((l) => l.stage === s).length}
                          </strong>
                        </div>
                        {filteredLeads
                          .filter((l) => l.stage === s)
                          .slice(0, 30)
                          .map((l) => (
                            <button
                              className="pipeline-card"
                              key={l.id}
                              onClick={() => setDetail(l)}
                            >
                              <small>{l.externalId}</small>
                              <strong>{l.customer}</strong>
                              <span>
                                {l.destination} · {l.travellers} travellers
                              </span>
                              <div>
                                <span>{inr(l.budget)} / person</span>
                                <ChevronRight size={15} />
                              </div>
                            </button>
                          ))}
                        {filteredLeads.filter((l) => l.stage === s).length >
                          30 && (
                          <small>
                            Showing first 30. Use search or list view for all.
                          </small>
                        )}
                      </section>
                    ))}
                </div>
              ) : (
                <section className="panel table-panel">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer / lead ID</th>
                          <th>Destination</th>
                          <th>Travel date</th>
                          <th>Source</th>
                          <th>Salesperson</th>
                          <th>Stage</th>
                          <th>Follow-up</th>
                          <th>Priority</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {pageLeads.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <button
                                className="table-link"
                                onClick={() => setDetail(l)}
                              >
                                {l.customer}
                              </button>
                              <small>{l.externalId}</small>
                            </td>
                            <td>
                              {l.destination}
                              <small>
                                {l.travellers} travellers · {inr(l.budget)} /
                                person
                              </small>
                            </td>
                            <td>{indianDate(l.travelStart)}</td>
                            <td>{l.source}</td>
                            <td>{userName(l.assignedId)}</td>
                            <td>
                              <Badge value={l.stage} />
                            </td>
                            <td
                              className={
                                l.followUp && l.followUp.slice(0, 10) < today()
                                  ? "negative"
                                  : ""
                              }
                            >
                              {l.followUp ? indianDate(l.followUp) : "—"}
                            </td>
                            <td>
                              {l.score === null ? (
                                <span className="muted" title={l.scoreReason}>
                                  Not scored
                                </span>
                              ) : (
                                <span title={l.scoreReason}>
                                  <Badge
                                    value={
                                      l.score >= 0.65
                                        ? "High"
                                        : l.score >= 0.35
                                          ? "Medium"
                                          : "Low"
                                    }
                                  />{" "}
                                  <small>
                                    {(l.score * 100).toFixed(0)}% · Demo model
                                  </small>
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Edit ${l.customer}`}
                                onClick={() => enquiryForm(l)}
                              >
                                <ArrowUpRight size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-footer">
                    <span>
                      {pageIndex * 20 + 1}–
                      {Math.min((pageIndex + 1) * 20, filteredLeads.length)} of{" "}
                      {filteredLeads.length.toLocaleString("en-IN")} enquiries
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="Previous page"
                        disabled={pageIndex === 0}
                        onClick={() => setPageIndex(pageIndex - 1)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span>Page {pageIndex + 1}</span>
                      <button
                        className="icon-button"
                        aria-label="Next page"
                        disabled={(pageIndex + 1) * 20 >= filteredLeads.length}
                        onClick={() => setPageIndex(pageIndex + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </section>
              )}
              <p className="method-note">
                Probability is a synthetic demo model output, not a validated
                forecast. Open an enquiry to see inputs, explanation, version
                and scoring date.
              </p>
            </>
          )}
          {page === "Packages" && (
            <>
              <p className="method-note">
                Package catalogue is agency-wide. Global filters apply to
                performance views; this catalogue shows all packages.
              </p>
              <div className="package-grid">
                {data.packages.map((p, i) => (
                  <article className="package-card panel" key={p.id}>
                    <div className={`destination-art art-${i % 6}`}>
                      <Compass size={100} strokeWidth={0.6} />
                      <span>{p.destination}</span>
                      <small>{p.days} DAYS OF DISCOVERY</small>
                    </div>
                    <div className="package-body">
                      <h2>{p.name}</h2>
                      <div className="package-price">
                        <strong>{inr(p.price)}</strong>
                        <span>/ person</span>
                      </div>
                      <p>
                        <CheckCircle2 size={14} />
                        {p.inclusions}
                      </p>
                      <details>
                        <summary>Exclusions & cost estimate</summary>
                        <p>{p.exclusions}</p>
                        <p>
                          Estimated supplier cost: {inr(p.estimatedCost)} /
                          person. Actual expenses are recorded separately on the
                          booking.
                        </p>
                      </details>
                      <div className="package-actions">
                        <button
                          className="btn secondary small"
                          onClick={() => {
                            quotationForm();
                            setForm((f) =>
                              f
                                ? {
                                    ...f,
                                    values: { ...f.values, packageId: p.id },
                                  }
                                : f,
                            );
                          }}
                        >
                          Build quotation <ArrowUpRight size={15} />
                        </button>
                        {manager && (
                          <button
                            className="text-button"
                            onClick={() => packageForm(p)}
                          >
                            Edit package
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!data.packages.length && (
                <Empty
                  title="Your next itinerary starts here"
                  detail="Add a package with a selling price and estimated supplier cost."
                />
              )}
            </>
          )}
          {page === "Quotations" && (
            <section className="panel table-panel">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Quotation</th>
                      <th>Customer</th>
                      <th>Package</th>
                      <th>Travellers</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.quotes
                      .filter((q) => a.leads.some((l) => l.id === q.leadId))
                      .slice(0, (pageIndex + 1) * 25)
                      .map((q) => (
                        <tr key={q.id}>
                          <td>
                            {q.id.slice(-10)}
                            <small>{indianDate(q.createdAt)}</small>
                          </td>
                          <td>{lead(q.leadId)?.customer}</td>
                          <td>{q.packageName}</td>
                          <td>{q.travellers}</td>
                          <td>{inr(q.total)}</td>
                          <td>
                            <Badge value={q.status} />
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="text-button"
                                onClick={() => setPrintQuote(q)}
                              >
                                <Printer size={14} />
                                Print / view
                              </button>
                              {q.status === "Draft" && (
                                <button
                                  className="btn secondary small"
                                  onClick={() =>
                                    openForm(
                                      "Accept quotation & create booking",
                                      "accept",
                                      [
                                        {
                                          name: "dueDate",
                                          label: "Customer balance due date",
                                          type: "date",
                                        },
                                      ],
                                      {
                                        dueDate: lead(
                                          q.leadId,
                                        )?.travelStart.slice(0, 10),
                                      },
                                      { id: q.id },
                                    )
                                  }
                                >
                                  Accept & book
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!data.quotes.some((q) =>
                a.leads.some((l) => l.id === q.leadId),
              ) && (
                <Empty
                  title="Ready to put it in writing?"
                  detail="Build a quotation from an open enquiry and a package."
                />
              )}
              <div className="table-footer">
                <span>
                  Quotations for enquiries received in the selected period
                </span>
                <button
                  className="text-button"
                  onClick={() => setPageIndex(pageIndex + 1)}
                  disabled={
                    data.quotes.filter((q) =>
                      a.leads.some((l) => l.id === q.leadId),
                    ).length <=
                    (pageIndex + 1) * 25
                  }
                >
                  Show more
                </button>
              </div>
            </section>
          )}
          {page === "Bookings" && (
            <>
              <div className="secondary-metrics compact">
                <div>
                  <div>
                    <small>Current customer balances</small>
                    <strong>{inr(a.due)}</strong>
                  </div>
                </div>
                <div>
                  <div>
                    <small>Supplier net balance</small>
                    <strong>
                      {inr(
                        a.bookings.reduce(
                          (s, b) => s + balances(b).supplierDue,
                          0,
                        ),
                      )}
                    </strong>
                  </div>
                </div>
                <div>
                  <div>
                    <small>Refunds still due on cancellations</small>
                    <strong>
                      {inr(
                        a.bookings
                          .filter((b) => b.status === "Cancelled")
                          .reduce((s, b) => s + balances(b).refundable, 0),
                      )}
                    </strong>
                  </div>
                </div>
              </div>
              <section className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Journey register</h2>
                    <p>Bookings created in the selected period</p>
                  </div>
                  <ExportButton
                    name="bookings"
                    rows={a.bookings.map((b) => ({
                      bookingId: b.id,
                      customer: lead(b.leadId)?.customer,
                      status: b.status,
                      travelStart: b.travelStart.slice(0, 10),
                      travelEnd: b.travelEnd.slice(0, 10),
                      salesINR: balances(b).sales / 100,
                      cashReceivedNetINR: balances(b).netCash / 100,
                      customerDueINR: balances(b).customerDue / 100,
                      supplierDueINR: balances(b).supplierDue / 100,
                      contributionINR: balances(b).contribution / 100,
                    }))}
                  />
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer / booking</th>
                        <th>Journey</th>
                        <th>Status</th>
                        <th>Supplier</th>
                        <th>Sales value</th>
                        <th>Customer due</th>
                        <th>Supplier due</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.bookings
                        .slice(pageIndex * 20, pageIndex * 20 + 20)
                        .map((b) => {
                          const bal = balances(b);
                          return (
                            <tr key={b.id}>
                              <td>
                                <strong>{lead(b.leadId)?.customer}</strong>
                                <small>{b.id.slice(-10)}</small>
                              </td>
                              <td>
                                {b.quote.destination}
                                <small>
                                  {indianDate(b.travelStart)} —{" "}
                                  {indianDate(b.travelEnd)}
                                </small>
                              </td>
                              <td>
                                <Badge value={b.status} />
                              </td>
                              <td>
                                <Badge value={b.supplierStatus} />
                              </td>
                              <td>
                                {inr(bal.sales)}
                                <small>
                                  Estimate: {inr(b.quote.estimatedCost)} cost
                                </small>
                              </td>
                              <td
                                className={
                                  b.dueDate.slice(0, 10) < today() &&
                                  bal.customerDue
                                    ? "negative"
                                    : ""
                                }
                              >
                                {inr(bal.customerDue)}
                                <small>Due {indianDate(b.dueDate)}</small>
                                {bal.refundable > 0 && (
                                  <small>
                                    Refund due {inr(bal.refundable)}
                                  </small>
                                )}
                              </td>
                              <td>
                                {inr(bal.supplierDue)}
                                <small>
                                  Actual cost {inr(bal.supplierCost)}
                                </small>
                                {bal.supplierDue < 0 && (
                                  <small>
                                    Supplier refund owed {inr(-bal.supplierDue)}
                                  </small>
                                )}
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="text-button"
                                    onClick={() => transactionForm(b)}
                                  >
                                    Record entry
                                  </button>
                                  {manager && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        openForm(
                                          "Update booking",
                                          "booking",
                                          [
                                            {
                                              name: "status",
                                              label: "Booking status",
                                              options: options([
                                                "Confirmed",
                                                "Completed",
                                                "Cancelled",
                                              ]),
                                            },
                                            {
                                              name: "supplierStatus",
                                              label: "Supplier confirmation",
                                              options: options([
                                                "Pending",
                                                "Part confirmed",
                                                "Confirmed",
                                              ]),
                                            },
                                            numField(
                                              "cancellationFee",
                                              "Retained cancellation fee (₹)",
                                            ),
                                          ],
                                          {
                                            status: b.status,
                                            supplierStatus: b.supplierStatus,
                                            cancellationFee: moneyInput(
                                              b.cancellationFee,
                                            ),
                                          },
                                          { id: b.id },
                                        )
                                      }
                                    >
                                      Update status
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {!a.bookings.length && (
                  <Empty
                    title="The journey is just beginning"
                    detail="Accept a quotation to create a booking and track its collections."
                  />
                )}
                <div className="table-footer">
                  <span>{a.bookings.length} bookings</span>
                  <div>
                    <button
                      className="icon-button"
                      aria-label="Previous bookings"
                      disabled={pageIndex === 0}
                      onClick={() => setPageIndex(pageIndex - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span>Page {pageIndex + 1}</span>
                    <button
                      className="icon-button"
                      aria-label="Next bookings"
                      disabled={(pageIndex + 1) * 20 >= a.bookings.length}
                      onClick={() => setPageIndex(pageIndex + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </section>
              <p className="method-note">
                Cancellation replaces booked value with the retained fee. Record
                any refund and supplier credit explicitly; cancelling does not
                move cash. Quotes preserve cost estimates. Contribution uses
                actual supplier expenses less credits, whether or not paid.
              </p>
            </>
          )}
          {page === "Transactions" &&
            (() => {
              const ids = new Set(
                data.leads
                  .filter(
                    (l) =>
                      (!filters.destination ||
                        l.destination === filters.destination) &&
                      (!filters.source || l.source === filters.source) &&
                      (!filters.salesperson ||
                        l.assignedId === filters.salesperson),
                  )
                  .map((l) => l.id),
              );
              const entries = data.bookings
                .filter((b) => ids.has(b.leadId))
                .flatMap((b) =>
                  b.transactions.map((t) => ({
                    ...t,
                    customer: lead(b.leadId)?.customer ?? "",
                  })),
                )
                .filter(
                  (t) =>
                    t.date.slice(0, 10) >= filters.from &&
                    t.date.slice(0, 10) <= filters.to,
                )
                .sort((x, y) => y.date.localeCompare(x.date));
              return (
                <section className="panel table-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Manual transaction ledger</h2>
                      <p>
                        This product records entries. It does not process
                        payments.
                      </p>
                    </div>
                    <ExportButton
                      name="transactions"
                      rows={entries.map((t) => ({
                        transactionId: t.id,
                        bookingId: t.bookingId,
                        customer: t.customer,
                        kind: t.kind,
                        amountINR: t.amount / 100,
                        date: t.date.slice(0, 10),
                        supplier: t.supplier,
                        memo: t.memo,
                        dueDate: t.dueDate?.slice(0, 10) ?? "",
                      }))}
                    />
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Customer</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Supplier</th>
                          <th>Due date</th>
                          <th>Reference / reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries
                          .slice(pageIndex * 25, pageIndex * 25 + 25)
                          .map((t) => (
                            <tr key={t.id}>
                              <td>{indianDate(t.date)}</td>
                              <td>
                                {t.customer}
                                <small>{t.bookingId.slice(-10)}</small>
                              </td>
                              <td>
                                <Badge value={t.kind} />
                              </td>
                              <td>{inr(t.amount)}</td>
                              <td>{t.supplier || "—"}</td>
                              <td>{t.dueDate ? indianDate(t.dueDate) : "—"}</td>
                              <td>{t.memo}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {!entries.length && (
                    <Empty
                      title="A clear record of every rupee"
                      detail="Record a receipt or expense against a booking to begin."
                    />
                  )}
                  <div className="table-footer">
                    <span>
                      {entries.length} entries · transaction-date filter
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="Previous transactions"
                        disabled={!pageIndex}
                        onClick={() => setPageIndex(pageIndex - 1)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span>Page {pageIndex + 1}</span>
                      <button
                        className="icon-button"
                        aria-label="Next transactions"
                        disabled={(pageIndex + 1) * 25 >= entries.length}
                        onClick={() => setPageIndex(pageIndex + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </section>
              );
            })()}
          {page === "Marketing" && manager && (
            <>
              <div className="secondary-metrics compact">
                <div>
                  <div>
                    <small>Advertising spend</small>
                    <strong>{inr(a.adSpend)}</strong>
                    <span>Full calendar months overlapping the date range</span>
                  </div>
                </div>
                <div>
                  <div>
                    <small>Operating expenses</small>
                    <strong>{inr(a.ops)}</strong>
                    <span>Agency-wide · shown separately</span>
                  </div>
                </div>
                <div>
                  <div>
                    <small>Booking contribution</small>
                    <strong>{inr(a.contribution)}</strong>
                    <span>Before marketing and operating expenses</span>
                  </div>
                </div>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Every source has a story</h2>
                    <p>First-touch source attribution · enquiry cohort</p>
                  </div>
                  <ExportButton
                    name="marketing"
                    rows={a.sourceStats.map((s) => ({
                      ...s,
                      sales: s.sales / 100,
                      spend: s.spend / 100,
                      cpl: s.cpl === null ? "" : s.cpl / 100,
                      cac: s.cac === null ? "" : s.cac / 100,
                      roas: s.roas ?? "",
                    }))}
                  />
                </div>
                {sourceTable(a.sourceStats)}
                <p className="method-note">
                  ¹ First-touch attribution assigns 100% of an active booking’s
                  sales value to the source stored on its enquiry. The cohort is
                  enquiries received in the selected period, including their
                  current bookings. ROAS = attributed active booked value ÷
                  channel advertising spend. It is booked-value ROAS, not cash
                  ROAS or proof of advertising impact. Spend is monthly and
                  cannot be allocated by destination or salesperson; CPL, cost
                  per booking and ROAS are unavailable for those slices.
                </p>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Marketing & operating spend</h2>
                    <p>
                      Manual monthly totals; saving the same month, kind and
                      channel replaces its total
                    </p>
                  </div>
                  <button
                    className="btn primary small"
                    onClick={() =>
                      openForm(
                        "Record monthly spend",
                        "spend",
                        [
                          { name: "month", label: "Month", type: "month" },
                          {
                            name: "kind",
                            label: "Category",
                            options: options(["Advertising", "Operating"]),
                          },
                          {
                            name: "channel",
                            label: "Channel / expense category",
                            hint: "For advertising use Meta Ads or Google Ads to match attribution.",
                          },
                          numField("amount", "Monthly total (₹)"),
                          {
                            name: "memo",
                            label: "Notes",
                            type: "textarea",
                            required: false,
                          },
                        ],
                        {
                          month: reportMonth,
                          kind: "Advertising",
                          channel: "Meta Ads",
                        },
                      )
                    }
                  >
                    <Plus size={16} />
                    Record spend
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Kind</th>
                        <th>Channel</th>
                        <th>Amount</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.spends
                        .filter(
                          (s) =>
                            s.month >= filters.from.slice(0, 7) &&
                            s.month <= filters.to.slice(0, 7) &&
                            (!filters.source ||
                              s.kind === "Operating" ||
                              s.channel === filters.source),
                        )
                        .map((s) => (
                          <tr key={s.id}>
                            <td>{s.month}</td>
                            <td>{s.kind}</td>
                            <td>{s.channel}</td>
                            <td>{inr(s.amount)}</td>
                            <td>{s.memo}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Contribution by package & destination</h2>
                    <p>
                      Actual supplier expense entries, independent of payment
                      timing
                    </p>
                  </div>
                  <ExportButton
                    name="package-contribution"
                    rows={a.packages.map((p) => ({
                      ...p,
                      salesINR: p.sales / 100,
                      costINR: p.cost / 100,
                      contributionINR: p.contribution / 100,
                    }))}
                  />
                </div>
                {packageTable(a.packages)}
              </section>
            </>
          )}
          {page === "Monthly report" && (
            <>
              <div className="report-actions">
                <span className="subtle-tag">
                  A practical review, built from your records
                </span>
                <button
                  className="btn primary"
                  onClick={() => setPrintReport(true)}
                >
                  <Printer size={16} />
                  Print / save PDF
                </button>
                <ExportButton
                  name={`monthly-report-${reportMonth}`}
                  rows={report.sourceStats.map((s) => ({
                    ...s,
                    month: reportMonth,
                    salesINR: s.sales / 100,
                    spendINR: s.spend / 100,
                  }))}
                />
              </div>
              {reportContent()}
            </>
          )}
          {page === "Lead intelligence" && (
            <>
              <div className="model-banner">
                <span className="icon-box gold">
                  <Sparkles size={24} />
                </span>
                <div>
                  <h2>Demo model — not validated on your agency</h2>
                  <p>
                    A reproducible logistic regression trained on synthetic
                    data. Use it to explore prioritisation, with human
                    judgement.
                  </p>
                </div>
              </div>
              <div className="report-columns">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Try a scenario</h2>
                      <p>
                        This calculator runs in memory. No enquiry is changed.
                      </p>
                    </div>
                  </div>
                  <div className="form-grid">
                    {[
                      {
                        label: "Budget fit (budget ÷ quote)",
                        min: 0.25,
                        max: 2,
                        step: 0.01,
                      },
                      {
                        label: "Days to departure at enquiry",
                        min: 0,
                        max: 365,
                        step: 1,
                      },
                      { label: "Travellers", min: 1, max: 20, step: 1 },
                      {
                        label: "First response hours",
                        min: 0,
                        max: 168,
                        step: 0.1,
                      },
                    ].map((f, i) => (
                      <label key={f.label}>
                        {f.label}
                        <input
                          aria-label={f.label}
                          type="number"
                          min={f.min}
                          max={f.max}
                          step={f.step}
                          value={calc[i]}
                          onChange={(e) =>
                            setCalc(
                              calc.map((v, j) =>
                                i === j ? e.target.value : v,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                    {["Repeat customer", "Itinerary requested"].map(
                      (label, i) => (
                        <label key={label}>
                          {label}
                          <select
                            value={calc[i + 4]}
                            onChange={(e) =>
                              setCalc(
                                calc.map((v, j) =>
                                  j === i + 4 ? e.target.value : v,
                                ),
                              )
                            }
                          >
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        </label>
                      ),
                    )}
                  </div>
                  {(() => {
                    try {
                      if (calc.slice(0, 4).some((v) => v === ""))
                        throw new Error("Complete every input");
                      const inputs = calc.map((v, i) =>
                        i < 4 ? Number(v) : Number(v === "true"),
                      );
                      if (
                        !Number.isInteger(inputs[1]) ||
                        !Number.isInteger(inputs[2])
                      )
                        throw new Error(
                          "Days and travellers must be whole numbers",
                        );
                      const p = predict(inputs);
                      return (
                        <div className="score-result">
                          <span>SYNTHETIC MODEL OUTPUT</span>
                          <strong>
                            {(p * 100).toFixed(1)}
                            <small>%</small>
                          </strong>
                          <Badge
                            value={
                              p >= 0.65 ? "High" : p >= 0.35 ? "Medium" : "Low"
                            }
                          />
                          <p>
                            Model booking probability · for demonstration only
                          </p>
                        </div>
                      );
                    } catch (e) {
                      return (
                        <p className="error-box">
                          Not scored: {(e as Error).message}
                        </p>
                      );
                    }
                  })()}
                </section>
                <section className="panel prose">
                  <h2>Useful context. Clear limits.</h2>
                  <p>
                    Eligible enquiries are scored when created, imported, edited
                    or quoted. Missing inputs and values outside the supported
                    ranges produce “Not scored”.
                  </p>
                  <ul>
                    <li>
                      Budget fit: 0.25–2.0; departure: 0–365 days from enquiry.
                    </li>
                    <li>Travellers: 1–20; first response: 0–168 hours.</li>
                    <li>
                      Repeat-customer and itinerary-request status must be
                      explicitly supplied.
                    </li>
                    <li>
                      High priority: ≥65%; medium: 35–65%; low: below 35%.
                    </li>
                    <li>
                      Explanations describe coefficient contributions relative
                      to the synthetic training average. They are associations,
                      not causes.
                    </li>
                  </ul>
                  <p>
                    <strong>Version:</strong> {modelInfo.version}
                  </p>
                  <p>
                    Python trains on 6,000 synthetic rows and evaluates on a
                    separate 2,000-row holdout. Evaluation and limitations are
                    in <code>ml/evaluation.json</code> and{" "}
                    <code>ml/README.md</code>. Those results do not establish
                    real-world accuracy.
                  </p>
                  <p>
                    No uploaded records are used for retraining. Lead stage,
                    receipts and booking outcome are excluded from model inputs.
                  </p>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Open enquiries, prioritised</h2>
                    <p>All dates · your permitted records only</p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Enquiry</th>
                        <th>Model probability</th>
                        <th>Explanation / reason</th>
                        <th>Scored at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leads
                        .filter((l) => !["Won", "Lost"].includes(l.stage))
                        .sort((x, y) => (y.score ?? -1) - (x.score ?? -1))
                        .slice(0, 25)
                        .map((l) => (
                          <tr key={l.id}>
                            <td>
                              <button
                                className="table-link"
                                onClick={() => setDetail(l)}
                              >
                                {l.customer}
                              </button>
                              <small>{l.destination}</small>
                            </td>
                            <td>
                              {l.score === null
                                ? "Not scored"
                                : (l.score * 100).toFixed(1) + "%"}
                            </td>
                            <td>
                              {l.scoreReason}
                              <small>{l.modelVersion ?? "No model run"}</small>
                            </td>
                            <td>{l.scoredAt ? indianDate(l.scoredAt) : "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {!data.demo && !data.access.canWrite && (
            <div className="info-box">
              Your trial or subscription is inactive. You can view and export
              existing records. Contact support to renew before changing
              business records.
            </div>
          )}
          {page === "Settings" && (
            <>
              <div className="report-columns">
                <section className="panel prose">
                  <h2>Agency profile</h2>
                  <p>
                    <strong>{data.agency.name}</strong>
                    <br />
                    {data.agency.contact || "Add your agency contact details."}
                  </p>
                  <p>{data.agency.footer}</p>
                  <div className="status-line">
                    <Badge value={data.agency.plan} />
                    <Badge value={data.agency.subscription} />
                    <span>Manually managed subscription</span>
                    <span>
                      {data.users.filter((u) => !u.disabled).length} /{" "}
                      {data.access.limits.seats} active users
                    </span>
                  </div>
                  {owner && (
                    <button
                      className="btn primary"
                      onClick={() =>
                        openForm(
                          "Agency settings",
                          "settings",
                          [
                            { name: "name", label: "Agency name" },
                            {
                              name: "logo",
                              label: "Logo URL (HTTPS)",
                              type: "url",
                              required: false,
                            },
                            {
                              name: "contact",
                              label: "Contact details",
                              type: "textarea",
                              required: false,
                            },
                            {
                              name: "footer",
                              label: "Quotation footer",
                              type: "textarea",
                              required: false,
                            },
                          ],
                          { ...data.agency },
                        )
                      }
                    >
                      Edit agency profile
                    </button>
                  )}
                  <p className="method-note">
                    {data.agency.subscription === "Trial"
                      ? `Trial ends ${indianDate(data.agency.trialEndsAt)}.`
                      : data.agency.subscriptionExpiresAt
                        ? `Subscription ends ${indianDate(data.agency.subscriptionExpiresAt)}.`
                        : "Subscription dates are managed by the service administrator."}{" "}
                    Plan limits are enforced on the server. No money is charged
                    automatically.
                  </p>
                  {owner && !data.access.emailConfigured && (
                    <p className="info-box">
                      Email invitations and password recovery need to be enabled
                      by the service administrator before client onboarding.
                    </p>
                  )}
                  {owner && !data.access.emailVerificationRequired && (
                    <p className="info-box">
                      Required email verification is not enabled yet. Complete
                      the launch checklist before onboarding real clients.
                    </p>
                  )}
                </section>
                <section className="panel prose">
                  <h2>Owner onboarding checklist</h2>
                  <ul className="checklist">
                    {[
                      [true, "Create your agency workspace"],
                      [!!data.agency.contact, "Add agency contact details"],
                      [data.users.length > 1, "Add your sales team"],
                      [data.packages.length > 0, "Create your first package"],
                      [data.leads.length > 0, "Add an enquiry"],
                      [
                        data.bookings.length > 0,
                        "Convert a quotation into a booking",
                      ],
                    ].map(([done, label]) => (
                      <li key={String(label)}>
                        <CheckCircle2
                          size={18}
                          className={done ? "positive" : "muted"}
                        />
                        {String(label)}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Your people</h2>
                    <p>
                      Owners manage team membership. Agents see only assigned
                      enquiries and their related records.
                    </p>
                  </div>
                  {owner && (
                    <button
                      className="btn primary small"
                      onClick={() =>
                        openForm("Invite team member", "invite", [
                          { name: "email", label: "Email", type: "email" },
                          {
                            name: "role",
                            label: "Role",
                            options: options(["AGENT", "MANAGER"]),
                          },
                        ])
                      }
                    >
                      <Plus size={16} />
                      Invite member
                    </button>
                  )}
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        {owner && <th>Email</th>}
                        <th>Role</th>
                        <th>Status</th>
                        {owner && <th>Access</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.users.map((u) => (
                        <tr key={u.id}>
                          <td>{u.name}</td>
                          {owner && (
                            <td>{"email" in u ? String(u.email) : "—"}</td>
                          )}
                          <td>{u.role}</td>
                          <td>
                            <Badge value={u.disabled ? "Disabled" : "Active"} />
                          </td>
                          {owner && (
                            <td>
                              {u.id === data.actor.id ? (
                                "You"
                              ) : (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    openForm(
                                      "Manage team access",
                                      "team",
                                      [
                                        {
                                          name: "role",
                                          label: "Role",
                                          options: options([
                                            "OWNER",
                                            "MANAGER",
                                            "AGENT",
                                          ]),
                                        },
                                        {
                                          name: "disabled",
                                          label: "Access status",
                                          options: [
                                            { value: "false", label: "Active" },
                                            {
                                              value: "true",
                                              label: "Disabled",
                                            },
                                          ],
                                        },
                                      ],
                                      {
                                        role: u.role,
                                        disabled: String(u.disabled),
                                      },
                                      { id: u.id },
                                    )
                                  }
                                >
                                  Manage access
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {owner && (
                <section className="panel">
                  <h2>Team invitations</h2>
                  <p className="method-note">
                    Recipients choose their own password. Invitations expire
                    after 7 days and reserve one plan seat.
                  </p>
                  {data.invitations.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Expires</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.invitations.map((i) => (
                            <tr key={i.id}>
                              <td>{i.email}</td>
                              <td>{i.role}</td>
                              <td>
                                {new Date(i.expiresAt) < new Date() &&
                                i.status === "Pending"
                                  ? "Expired"
                                  : i.status}
                              </td>
                              <td>{indianDate(i.expiresAt)}</td>
                              <td>
                                {i.status === "Pending" && (
                                  <button
                                    className="text-button"
                                    disabled={busy || data.demo}
                                    onClick={() =>
                                      openForm(
                                        "Revoke invitation",
                                        "invite-revoke",
                                        [],
                                        {},
                                        { id: i.id },
                                      )
                                    }
                                  >
                                    Revoke invitation
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted">No invitations sent yet.</p>
                  )}
                </section>
              )}
              {!data.demo && <SecuritySettings />}
              {!data.demo && (
                <section className="panel prose">
                  <h2>Your password</h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      const fd = new FormData(e.currentTarget);
                      const r = await authClient.changePassword({
                        currentPassword: String(fd.get("current")),
                        newPassword: String(fd.get("new")),
                        revokeOtherSessions: true,
                      });
                      setBusy(false);
                      notify(
                        r.error?.message ??
                          "Password changed. Other sessions were revoked.",
                      );
                    }}
                  >
                    <div className="form-grid">
                      <label>
                        Current password
                        <input
                          name="current"
                          type="password"
                          required
                          autoComplete="current-password"
                        />
                      </label>
                      <label>
                        New password
                        <input
                          name="new"
                          type="password"
                          required
                          minLength={12}
                          maxLength={128}
                          autoComplete="new-password"
                        />
                      </label>
                    </div>
                    <button className="btn secondary" disabled={busy}>
                      Change password
                    </button>
                  </form>
                </section>
              )}
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Workspace export & audit trail</h2>
                    <p>
                      Exports contain only records you may access. Full-record
                      exports store money as integer paise. Spreadsheet formulas
                      are escaped.
                    </p>
                  </div>
                  <div className="row-actions">
                    <select
                      aria-label="Export record type"
                      value={exportTable}
                      onChange={(e) => setExportTable(e.target.value)}
                    >
                      {Object.keys(exportTables).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <ExportButton
                      name={`agency-${exportTable.toLowerCase()}`}
                      rows={workspaceExport}
                    />
                  </div>
                </div>
                <div className="audit-list">
                  {data.activities.slice(0, 30).map((x) => (
                    <div key={x.id}>
                      <span className="audit-dot" />
                      <p>
                        {x.action}
                        <small>
                          {userName(x.actor)} · {indianDate(x.createdAt)}
                        </small>
                      </p>
                    </div>
                  ))}
                  {!data.activities.length && (
                    <p className="muted">
                      Important enquiry, booking, payment and access changes
                      will appear here.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
          {page === "Demo guide" && (
            <div className="guide-layout">
              <section className="panel prose">
                <span className="eyebrow">A THREE-MINUTE TOUR</span>
                <h2>Show the journey, then show the value.</h2>
                <ol className="guide-steps">
                  <li>
                    <strong>0:00–0:40 · Start with the overview</strong>
                    <p>
                      “Here is your agency in one view: enquiries, bookings,
                      collections and balances. Contribution is separate from
                      advertising and operating costs.” Change a destination
                      filter to show that the numbers come from connected
                      records.
                    </p>
                  </li>
                  <li>
                    <strong>0:40–1:20 · Open an enquiry</strong>
                    <p>
                      Show salesperson assignment, follow-ups and the pipeline.
                      Open an enquiry to see its activity history. Explain the
                      synthetic model label before showing its score.
                    </p>
                  </li>
                  <li>
                    <strong>1:20–2:00 · Follow the booking</strong>
                    <p>
                      View a printable quotation. Open Bookings to show partial
                      collections, supplier balances and cancellations. Explain
                      that receipts are recorded manually; the system does not
                      collect money.
                    </p>
                  </li>
                  <li>
                    <strong>2:00–2:40 · Review the month</strong>
                    <p>
                      Open Marketing for source attribution and acquisition
                      costs. Show the monthly report, its observations and
                      browser-print PDF workflow.
                    </p>
                  </li>
                  <li>
                    <strong>2:40–3:00 · Invite the next step</strong>
                    <p>
                      “We can create your own workspace, add your packages,
                      import your enquiries and train your team. Subscription
                      and onboarding are arranged manually.”
                    </p>
                  </li>
                </ol>
                <button
                  className="btn primary"
                  onClick={() => changePage("Overview")}
                >
                  Start the tour <ArrowRight size={16} />
                </button>
              </section>
              <section className="panel prose">
                <h2>How to use this demo</h2>
                <p>
                  The isolated demo contains 1,500 fictional enquiries and 330
                  bookings across six completed months. Names and agency details
                  are invented; no real customer contacts are included.
                </p>
                <p>
                  Use the date, source, destination and salesperson filters.
                  Search enquiries, switch to pipeline view, inspect records,
                  export CSVs and print quotations or reports. The model
                  calculator is interactive and does not save data.
                </p>
                <p>
                  Save controls explain that this demo is read-only. Create an
                  agency to try the full write workflow with your own records.
                </p>
                <Link className="btn secondary" href="/login?signup=1">
                  Create an agency <ArrowUpRight size={16} />
                </Link>
              </section>
              <section className="panel prose span-2">
                <h2>KPI methodology</h2>
                <dl className="methodology">
                  <div>
                    <dt>Enquiries / conversion</dt>
                    <dd>
                      Enquiries received in the selected dates. Conversion is
                      the share with a current, non-cancelled booking; this is
                      an enquiry cohort metric.
                    </dd>
                  </div>
                  <div>
                    <dt>Booked sales value</dt>
                    <dd>
                      Current total of bookings created in the date range,
                      including optional quotation tax. Cancelled bookings
                      contribute only their retained cancellation fee. This is a
                      commercial booked-value metric, not recognised accounting
                      revenue.
                    </dd>
                  </div>
                  <div>
                    <dt>Cash collected</dt>
                    <dd>
                      Receipts minus refunds dated in the selected period, even
                      when the booking was created in another month. Supplier
                      payments are separate cash outflows.
                    </dd>
                  </div>
                  <div>
                    <dt>Customer balances</dt>
                    <dd>
                      Current booked obligation (or cancellation fee) less
                      receipts plus refunds, floored at zero, for bookings
                      created in the period. Overpayments to return are shown
                      separately as refunds due.
                    </dd>
                  </div>
                  <div>
                    <dt>Supplier balances</dt>
                    <dd>
                      Recorded actual expenses minus supplier credits and
                      supplier payments. Expense entries recognise costs;
                      payment entries settle balances and never create a second
                      cost.
                    </dd>
                  </div>
                  <div>
                    <dt>Booking contribution</dt>
                    <dd>
                      Booked sales value minus actual supplier expenses plus
                      credits. Quotes’ estimates are excluded. It is before
                      advertising, operating expenses and any statutory tax
                      reconciliation; it is not net profit.
                    </dd>
                  </div>
                  <div>
                    <dt>CPL, acquisition cost & ROAS</dt>
                    <dd>
                      Monthly channel ad spend divided by enquiry count or
                      active booking count. First-touch attribution assigns
                      booked value to the source on the enquiry.
                      Revenue-to-spend is labelled booked-value ROAS; source
                      edits change attribution. Costs are unavailable when
                      destination or salesperson filters prevent allocating
                      spend.
                    </dd>
                  </div>
                  <div>
                    <dt>Dates & monthly reports</dt>
                    <dd>
                      Dates are calendar dates, displayed in Indian format.
                      Monthly spend is never prorated: it includes full months
                      touched by the date range. Reports use current booking and
                      enquiry state; they are not historical accounting
                      snapshots. Follow-up completion is a count of recorded
                      completion events.
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              Vashisht TravelOS{" "}
              <span className="muted">by Vashisht Analytics</span>
            </span>
            <span>Thoughtfully built for the business of travel.</span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {form && (
        <Modal
          title={form.title}
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const values: Record<string, unknown> = Object.fromEntries(
                new FormData(e.currentTarget),
              );
              let input = { ...values, ...form.extra };
              if (form.action === "lead")
                input = { lead: values, ...form.extra };
              if (form.action === "team")
                input.disabled = values.disabled === "true";
              if (await run(form.action, input)) setForm(null);
            }}
          >
            <Fields fields={form.fields} values={form.values} />
            {form.action === "quote" && (
              <p className="method-note">
                Total = travellers × package price − discount + optional tax on
                the discounted subtotal. Amounts are rounded to the nearest
                paise. Package price and estimated supplier costs are
                snapshotted in the quotation.
              </p>
            )}
            {form.action === "transaction" && (
              <p className="method-note">
                Entries are append-only and require a reference or reason.
                Refunds reduce customer cash; supplier credits reduce actual
                costs. No money is transferred by this app.
              </p>
            )}
            {data.demo && (
              <div className="info-box">
                Read-only demo. You can explore the form; saving requires your
                own agency workspace.
              </div>
            )}
            {formError && (
              <div role="alert" className="error-box">
                {formError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setForm(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : "Save " +
                    (form.action === "accept" ? "& create booking" : "record")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.customer} onClose={() => setDetail(null)}>
          <div className="detail-summary">
            <Badge value={detail.stage} />
            <span>
              {detail.externalId} · {detail.destination}
            </span>
          </div>
          <div className="detail-grid">
            <div>
              <small>Travel dates</small>
              <strong>
                {indianDate(detail.travelStart)} —{" "}
                {indianDate(detail.travelEnd)}
              </strong>
            </div>
            <div>
              <small>Travellers & budget</small>
              <strong>
                {detail.travellers} · {inr(detail.budget)} / person
              </strong>
            </div>
            <div>
              <small>Salesperson</small>
              <strong>{userName(detail.assignedId)}</strong>
            </div>
            <div>
              <small>Source & follow-up</small>
              <strong>
                {detail.source} ·{" "}
                {detail.followUp
                  ? indianDate(detail.followUp)
                  : "Not scheduled"}
              </strong>
            </div>
            <div>
              <small>Contact</small>
              <strong>
                {[detail.email, detail.phone].filter(Boolean).join(" · ") ||
                  "Not provided"}
              </strong>
            </div>
            <div>
              <small>Enquiry date</small>
              <strong>{indianDate(detail.enquiryDate)}</strong>
            </div>
          </div>
          {detail.notes && <p className="info-box">{detail.notes}</p>}
          {detail.lostReason && <p>Lost reason: {detail.lostReason}</p>}
          <section className="score-detail">
            <h3>
              <Sparkles size={16} />
              Demo model — not validated on your agency
            </h3>
            <p>
              {detail.score === null
                ? "Not scored"
                : `${(detail.score * 100).toFixed(1)}% model booking probability · ${detail.score >= 0.65 ? "High" : detail.score >= 0.35 ? "Medium" : "Low"} priority`}
            </p>
            <p>{detail.scoreReason}</p>
            <small>
              {detail.modelVersion ?? "No model run"}
              {detail.scoredAt && ` · Scored ${indianDate(detail.scoredAt)}`}
            </small>
            <details>
              <summary>Scoring inputs</summary>
              <p>
                Budget fit:{" "}
                {detail.quotedPrice
                  ? (detail.budget / detail.quotedPrice).toFixed(2)
                  : "Unknown"}{" "}
                · Days to departure at enquiry:{" "}
                {Math.round(
                  (+new Date(detail.travelStart) -
                    +new Date(detail.enquiryDate)) /
                    86400000,
                )}{" "}
                · Travellers: {detail.travellers} · Response hours:{" "}
                {detail.firstResponseHours ?? "Unknown"} · Repeat customer:{" "}
                {detail.repeatCustomer === null
                  ? "Unknown"
                  : String(detail.repeatCustomer)}{" "}
                · Itinerary requested:{" "}
                {detail.itineraryRequested === null
                  ? "Unknown"
                  : String(detail.itineraryRequested)}
              </p>
            </details>
          </section>
          <h3>Activity history</h3>
          <div className="audit-list">
            {data.activities
              .filter((x) => x.leadId === detail.id)
              .map((x) => (
                <div key={x.id}>
                  <span className="audit-dot" />
                  <p>
                    {x.action}
                    <small>
                      {indianDate(x.createdAt)} · {userName(x.actor)}
                    </small>
                  </p>
                </div>
              ))}
            {!data.activities.some((x) => x.leadId === detail.id) && (
              <p className="muted">No activity logged yet.</p>
            )}
          </div>
          <div className="modal-actions wrap">
            <button
              className="btn secondary"
              onClick={() => enquiryForm(detail)}
            >
              Edit enquiry
            </button>
            <button
              className="btn secondary"
              onClick={() => {
                const id = detail.id;
                setDetail(null);
                openForm(
                  "Complete follow-up",
                  "followup",
                  [
                    { name: "note", label: "What happened?", type: "textarea" },
                    {
                      name: "date",
                      label: "Next follow-up (optional)",
                      type: "date",
                      required: false,
                    },
                  ],
                  {},
                  { id },
                );
              }}
            >
              Log follow-up
            </button>
            {!["Won", "Lost"].includes(detail.stage) && (
              <button
                className="btn primary"
                onClick={() => quotationForm(detail)}
              >
                Build quotation
              </button>
            )}
          </div>
        </Modal>
      )}
      {importOpen && (
        <Modal
          title="Import enquiries from CSV"
          onClose={() => setImportOpen(false)}
        >
          <p className="muted">
            Up to 500 rows. All rows must pass validation; duplicate external
            IDs within this agency are rejected. Dates use YYYY-MM-DD, money
            uses rupees, booleans use true / false.
          </p>
          <ExportButton
            name="enquiry-template"
            rows={[
              {
                externalId: "IMPORT-001",
                customer: "Sample Traveller",
                email: "",
                phone: "",
                destination: "Kerala",
                enquiryDate: today(),
                travelStart: new Date(Date.now() + 30 * 86400000)
                  .toISOString()
                  .slice(0, 10),
                travelEnd: new Date(Date.now() + 35 * 86400000)
                  .toISOString()
                  .slice(0, 10),
                travellers: 2,
                budget: 25000,
                quotedPrice: 28000,
                source: "Website",
                assignedId: data.demo ? "demo-user-0" : data.actor.id,
                stage: "New",
                notes: "",
                lostReason: "",
                followUp: "",
                firstResponseHours: "",
                repeatCustomer: "",
                itineraryRequested: "",
              },
            ]}
          />
          <p className="method-note">
            Assigned IDs:{" "}
            {data.users
              .filter((u) => !u.disabled)
              .map((u) => `${u.name}: ${u.id}`)
              .join(" · ")}
          </p>
          <label className="upload-zone">
            <Upload size={25} />
            <strong>Choose a CSV file</strong>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                if (e.target.files?.[0]) void csvFile(e.target.files[0]);
              }}
            />
          </label>
          {importErrors.length > 0 && (
            <div className="error-box" role="alert">
              <strong>{importErrors.length} validation issue(s)</strong>
              <ul>
                {importErrors.slice(0, 30).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {importRows.length > 0 && (
            <>
              <h3>{importRows.length} rows · preview (first 10)</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>External ID</th>
                      <th>Customer</th>
                      <th>Destination</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td>{r.externalId}</td>
                        <td>{r.customer}</td>
                        <td>{r.destination}</td>
                        <td>{r.stage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {formError && (
            <p className="error-box" role="alert">
              {formError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="btn secondary"
              onClick={() => setImportOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={!importRows.length || !!importErrors.length || busy}
              onClick={async () => {
                if (await run("import", { rows: importRows }))
                  setImportOpen(false);
              }}
            >
              {busy ? "Importing…" : `Import ${importRows.length} enquiries`}
            </button>
          </div>
        </Modal>
      )}
      {printQuote && (
        <Modal title="Quotation preview" onClose={() => setPrintQuote(null)}>
          <div className="print-sheet quotation">
            <div className="quotation-header">
              <div>
                {data.agency.logo && (
                  <img
                    className="quote-logo"
                    src={data.agency.logo}
                    alt="Agency logo"
                  />
                )}
                <Compass size={28} />
                <h2>{data.agency.name}</h2>
                <p>{data.agency.contact}</p>
              </div>
              <div>
                <span className="eyebrow">YOUR NEXT JOURNEY</span>
                <h1>Quotation</h1>
                <p>{printQuote.id}</p>
                <p>{indianDate(printQuote.createdAt)}</p>
              </div>
            </div>
            <div className="quote-to">
              <small>PREPARED FOR</small>
              <h2>{lead(printQuote.leadId)?.customer}</h2>
              <p>
                {printQuote.packageName} · {printQuote.destination} ·{" "}
                {printQuote.duration} days
              </p>
              <p>
                {indianDate(printQuote.travelStart)} —{" "}
                {indianDate(printQuote.travelEnd)}
              </p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Details</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    {printQuote.travellers} travellers ×{" "}
                    {inr(printQuote.unitPrice)}
                  </td>
                  <td>{inr(printQuote.travellers * printQuote.unitPrice)}</td>
                </tr>
                <tr>
                  <td>Discount</td>
                  <td>− {inr(printQuote.discount)}</td>
                </tr>
                <tr>
                  <td>Optional tax ({printQuote.taxBps / 100}%)</td>
                  <td>
                    {inr(
                      printQuote.total -
                        (printQuote.travellers * printQuote.unitPrice -
                          printQuote.discount),
                    )}
                  </td>
                </tr>
                <tr className="quote-total">
                  <td>Total quotation</td>
                  <td>{inr(printQuote.total)}</td>
                </tr>
              </tbody>
            </table>
            <h3>Included in your journey</h3>
            <p>{printQuote.inclusions}</p>
            <h3>Exclusions</h3>
            <p>{printQuote.exclusions}</p>
            <div className="quotation-footer">{data.agency.footer}</div>
            {data.demo && (
              <p className="method-note">
                DEMO · Fictional quotation. Not a confirmed booking or tax
                invoice.
              </p>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn primary" onClick={() => window.print()}>
              <Printer size={16} />
              Print / save PDF
            </button>
          </div>
        </Modal>
      )}
      {printReport && (
        <Modal
          title="Monthly report preview"
          onClose={() => setPrintReport(false)}
        >
          <div className="print-sheet">{reportContent()}</div>
          <div className="modal-actions">
            <button className="btn primary" onClick={() => window.print()}>
              <Printer size={16} />
              Print / save PDF
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
