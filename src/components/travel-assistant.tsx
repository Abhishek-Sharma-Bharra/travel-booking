"use client";
import { useState } from "react";
import type { Dataset } from "@/lib/data";
import {
  priorities,
  fictionalExtraction,
  fictionalMessage,
  extractionSchema,
  followUpDraft,
  packageSuggestions,
  type Extraction,
} from "@/lib/assistant";
import { inr, indianDate, indiaToday } from "@/lib/money";
type Lead = Dataset["leads"][number];
const extractionLabels: Record<string, string> = {
  customer: "Customer name",
  destination: "Destination",
  departureCity: "Departure city",
  travelPeriod: "Approximate travel period",
  travelStart: "Exact travel start (if known)",
  travelEnd: "Exact travel end (if known)",
  adults: "Adults",
  children: "Children",
  nights: "Nights",
  budgetAmount: "Budget amount",
  currency: "Currency",
  hotelCategory: "Hotel category",
  tripType: "Trip type",
};
export function PrioritiesPanel({
  data,
  onOpen,
  onRecord,
}: {
  data: Dataset;
  onOpen: (l: Lead) => void;
  onRecord?: (kind: string, id: string, leadId: string) => void;
}) {
  const [kind, setKind] = useState(""),
    [owner, setOwner] = useState(""),
    [limit, setLimit] = useState(10);
  const queue = priorities(data),
    filtered = queue.filter(
      (x) => (!kind || x.kind === kind) && (!owner || x.owner === owner),
    );
  const now = indiaToday();
  const recent = data.leads.filter((l) => l.enquiryDate.slice(0, 10) === now);
  return (
    <section className="assistant-card">
      <h2>Today’s priorities</h2>
      <p>
        Operational rules · India date {now} · current permitted records ·
        refreshed{" "}
        {new Date(data.refreshedAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        })}{" "}
        IST. Closed enquiries leave the sales queue.
      </p>
      <div className="assistant-controls">
        <label>
          Priority type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setLimit(10);
            }}
          >
            <option value="">All types ({queue.length})</option>
            {Array.from(new Set(queue.map((x) => x.kind))).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setLimit(10);
            }}
          >
            <option value="">All permitted owners</option>
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {filtered.length} items match.{" "}
        {filtered.length === 0 && "Nothing needs attention under these rules."}
      </p>
      {filtered.slice(0, limit).map((x) => (
        <div className="priority-row" key={x.key}>
          <div>
            <strong>
              {x.kind} · {data.leads.find((l) => l.id === x.leadId)?.customer}
            </strong>
            <p>{x.reason}</p>
            <small>
              {data.users.find((u) => u.id === x.owner)?.name} ·{" "}
              {indianDate(x.date)} · Record {x.recordId}
            </small>
          </div>
          <button
            className="btn secondary"
            onClick={() =>
              onRecord
                ? onRecord(x.kind, x.recordId, x.leadId)
                : onOpen(data.leads.find((l) => l.id === x.leadId)!)
            }
          >
            Open{" "}
            {x.kind === "Quotation follow-up"
              ? "quotation"
              : x.kind === "Customer payment due" || x.kind === "Departure task"
                ? "booking"
                : "enquiry"}
          </button>
        </div>
      ))}
      {filtered.length > limit && (
        <button
          className="btn secondary"
          onClick={() => setLimit((n) => n + 10)}
        >
          Show next 10
        </button>
      )}
      {data.actor.role !== "AGENT" && (
        <details>
          <summary>Owner’s briefing · today</summary>
          <p>
            {recent.length} enquiries received today;{" "}
            {
              data.bookings.filter((b) => b.createdAt.slice(0, 10) === now)
                .length
            }{" "}
            bookings created today.{" "}
            {queue.filter((x) => x.kind === "Overdue follow-up").length} overdue
            follow-ups,{" "}
            {queue.filter((x) => x.kind === "Quotation follow-up").length}{" "}
            quotes requiring attention and{" "}
            {queue.filter((x) => x.kind === "Customer payment due").length}{" "}
            customer balances due.
          </p>
          <div className="assistant-controls">
            {[
              "Overdue follow-up",
              "Quotation follow-up",
              "Customer payment due",
            ].map((k) => (
              <button
                key={k}
                className="btn secondary"
                onClick={() => {
                  setKind(k);
                  setOwner("");
                  setLimit(10);
                }}
              >
                View {k.toLowerCase()}
              </button>
            ))}
          </div>
          <ul>
            {data.users
              .filter((u) => !u.disabled)
              .map((u) => (
                <li key={u.id}>
                  {u.name}:{" "}
                  {
                    data.leads.filter(
                      (l) =>
                        l.assignedId === u.id &&
                        !["Won", "Lost"].includes(l.stage),
                    ).length
                  }{" "}
                  open enquiries; {queue.filter((x) => x.owner === u.id).length}{" "}
                  priority items.{" "}
                  <button
                    className="table-link"
                    onClick={() => {
                      setOwner(u.id);
                      setKind("");
                      setLimit(10);
                    }}
                  >
                    View workload
                  </button>
                </li>
              ))}
          </ul>
          <p>
            Source activity today (association, not causation):{" "}
            {Array.from(new Set(recent.map((l) => l.source)))
              .map(
                (s) => `${s}: ${recent.filter((l) => l.source === s).length}`,
              )
              .join("; ") || "No new enquiries today."}
          </p>
        </details>
      )}
      <details>
        <summary>How to read the numbers</summary>
        <p>
          Won is an enquiry stage. Active bookings exclude cancellations;
          cancelled enquiries remain historically Won, so conversion excludes
          their cancelled bookings. Booked value is sales commitments, not cash
          collected. Contribution subtracts recorded supplier costs; net profit
          also subtracts recorded advertising and operating spend. Overview uses
          enquiry date for enquiry counts and booking-created date for booked
          value. Conversion follows the enquiry cohort into its current
          non-cancelled bookings. Cash collected uses transaction dates
          independently. Current balances are not historical period cash flows.
          Payments due use booking due dates and current recorded balances.
          Departure tasks use recorded supplier confirmation status; they do not
          imply a complete trip checklist.
        </p>
      </details>
    </section>
  );
}
export function AssistantPanel({
  data,
  onReview,
}: {
  data: Dataset;
  onReview: (v: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState(""),
    [draft, setDraft] = useState<Extraction | null>(null),
    [mode, setMode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState("");
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(25000),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "AI unavailable");
      setDraft(extractionSchema.parse(b.draft));
      setMode(b.mode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const duplicates = data.leads.filter(
    (l) =>
      (email.trim() && l.email.toLowerCase() === email.trim().toLowerCase()) ||
      (phone.replace(/\D/g, "") &&
        l.phone.replace(/\D/g, "") === phone.replace(/\D/g, "")),
  );
  const edit = (k: keyof Extraction, v: unknown) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  return (
    <section className="assistant-card">
      <button className="btn secondary" onClick={() => setOpen(!open)}>
        Create from customer message
      </button>
      {open && (
        <>
          <p>
            Review English, Hindi or Hinglish messages. Do not paste passport,
            card, bank or document details. Contact identifiers are removed
            before AI processing. Nothing is saved here.
          </p>
          <label>
            Original customer message
            <textarea
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <div className="assistant-controls">
            <button
              disabled={busy || data.demo || !message.trim()}
              className="btn primary"
              onClick={generate}
            >
              {busy ? "Preparing draft…" : "Extract with live AI"}
            </button>
            <button
              className="btn secondary"
              onClick={() => {
                setMessage(fictionalMessage);
                setDraft(fictionalExtraction);
                setMode("Fictional preview — not live AI");
                setError("");
              }}
            >
              Load fictional preview
            </button>
            <button
              className="btn secondary"
              onClick={() => {
                setDraft({
                  ...fictionalExtraction,
                  customer: null,
                  destination: null,
                  travelPeriod: null,
                  adults: null,
                  nights: null,
                  budgetAmount: null,
                  currency: null,
                  tripType: null,
                  missing: [],
                  questions: [],
                });
                setMode("Manual entry — no AI");
              }}
            >
              Enter manually
            </button>
          </div>
          {data.demo && (
            <p>
              Public demo: fictional preview only. Live AI and saving are
              disabled.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {draft && (
            <>
              <h3>{mode}</h3>
              <div className="assistant-controls">
                {(
                  [
                    "customer",
                    "destination",
                    "departureCity",
                    "travelPeriod",
                    "travelStart",
                    "travelEnd",
                    "adults",
                    "children",
                    "nights",
                    "budgetAmount",
                    "currency",
                    "hotelCategory",
                    "tripType",
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {extractionLabels[k]}
                    <input
                      value={draft[k] ?? ""}
                      type={
                        [
                          "adults",
                          "children",
                          "nights",
                          "budgetAmount",
                        ].includes(k)
                          ? "number"
                          : "text"
                      }
                      onChange={(e) =>
                        edit(
                          k,
                          e.target.value === ""
                            ? null
                            : [
                                  "adults",
                                  "children",
                                  "nights",
                                  "budgetAmount",
                                ].includes(k)
                              ? Number(e.target.value)
                              : e.target.value,
                        )
                      }
                    />
                  </label>
                ))}
                <label>
                  Child ages (comma separated)
                  <input
                    value={draft.childAges.join(",")}
                    onChange={(e) =>
                      edit(
                        "childAges",
                        e.target.value
                          ? e.target.value.split(",").map(Number)
                          : [],
                      )
                    }
                  />
                </label>
                <label>
                  Budget basis
                  <select
                    value={draft.budgetBasis}
                    onChange={(e) => edit("budgetBasis", e.target.value)}
                  >
                    {["total", "per person", "unknown"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Preferences
                  <textarea
                    value={draft.preferences.join("\n")}
                    onChange={(e) =>
                      edit("preferences", e.target.value.split("\n"))
                    }
                  />
                </label>
                <label>
                  Email for duplicate check (not sent to AI)
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Phone for duplicate check (not sent to AI)
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>
              <p>Missing: {draft.missing.join("; ") || "Review all fields."}</p>
              <ul>
                {draft.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              {duplicates.length > 0 && (
                <p role="alert">
                  Possible duplicate:{" "}
                  {duplicates.map((l) => l.externalId).join(", ")}. Review the
                  existing records before continuing.
                </p>
              )}
              <button
                disabled={data.demo}
                className="btn primary"
                onClick={() => {
                  const parsed = extractionSchema.safeParse(draft);
                  if (!parsed.success) {
                    setError("Please check the edited fields.");
                    return;
                  }
                  if (
                    duplicates.length &&
                    !window.confirm(
                      "Possible duplicate found. Continue to review another enquiry?",
                    )
                  )
                    return;
                  onReview({
                    customer: draft.customer || "",
                    destination: draft.destination || "",
                    email,
                    phone,
                    travelStart: draft.travelStart || "",
                    travelEnd: draft.travelEnd || "",
                    travellers:
                      (draft.adults || 0) + (draft.children || 0) || "",
                    budget:
                      draft.currency === "INR" &&
                      draft.budgetAmount !== null &&
                      draft.budgetBasis === "per person"
                        ? String(draft.budgetAmount)
                        : "0",
                    originalMessage: message,
                    requirementDraft: draft,
                    notes: `Reviewed customer-message draft. Approximate period: ${draft.travelPeriod || "Unknown"}. Budget: ${draft.budgetAmount ?? "Unknown"} ${draft.currency || ""} (${draft.budgetBasis}). Resolve missing requirements before quoting.`,
                  });
                }}
              >
                Review in enquiry form — not saved yet
              </button>
              <p>
                Exact dates are required by the current enquiry workflow.
                Resolve them before saving. Total/foreign/unknown budgets stay
                in notes; they are never silently converted to per-person INR.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
export function FollowUpPanel({
  data,
  lead,
  onQuote,
  onSchedule,
}: {
  data: Dataset;
  lead: Lead;
  onQuote: (v: Record<string, unknown>) => void;
  onSchedule: (d: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState("First response"),
    [language, setLanguage] = useState("English"),
    [draft, setDraft] = useState(""),
    [date, setDate] = useState(""),
    [notice, setNotice] = useState(""),
    [proposal, setProposal] = useState(""),
    [packageId, setPackageId] = useState("");
  const related = data.activities.filter((a) => a.leadId === lead.id);
  const suggestions = packageSuggestions(data, lead.id);
  const p = data.packages.find((p) => p.id === packageId);
  const quotes = data.quotes.filter((q) => q.leadId === lead.id);
  const bookings = data.bookings.filter((b) => b.leadId === lead.id);
  return (
    <section className="assistant-card">
      <h3>Sales & operations assistant</h3>
      <p>
        Recorded activity: {related.length} events. Last logged follow-up:{" "}
        {related
          .find((a) => a.action.includes("Follow-up completed"))
          ?.createdAt.slice(0, 10) || "Not recorded"}
        . Next follow-up: {lead.followUp?.slice(0, 10) || "Not scheduled"}. This
        is an activity summary, not a claim that a message was delivered.
      </p>
      <p>
        Next action:{" "}
        {priorities(data).find((x) => x.leadId === lead.id)?.reason ||
          "Review customer requirements and schedule an agreed next step."}
      </p>
      <details>
        <summary>Related quotations and bookings</summary>
        {quotes.map((q) => (
          <p key={q.id}>
            Quotation {q.id} · version {q.version} · {q.status} · {inr(q.total)}
          </p>
        ))}
        {bookings.map((b) => (
          <p key={b.id}>
            Booking {b.id} · {b.status} · due {indianDate(b.dueDate)} · supplier{" "}
            {b.supplierStatus}
          </p>
        ))}
        {!quotes.length && !bookings.length && <p>No related records.</p>}
      </details>
      <div className="assistant-controls">
        <label>
          Draft type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {[
              "First response",
              "Missing information",
              "Quotation follow-up",
              "Payment reminder",
              "Lost-lead reactivation",
            ].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {["English", "Hindi", "Hinglish"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button
          className="btn secondary"
          onClick={() => setDraft(followUpDraft(data, lead.id, kind, language))}
        >
          Prepare template draft
        </button>
      </div>
      <label>
        Editable follow-up draft
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <button
        className="btn secondary"
        disabled={!draft}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(draft);
            setNotice("Copied only. Not sent or marked delivered.");
          } catch {
            setNotice("Select and copy the text manually.");
          }
        }}
      >
        Copy message
      </button>
      <p>
        WhatsApp/email delivery integration: not connected in this workflow. No
        automatic sending.
      </p>
      <label>
        Schedule internal follow-up
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <button
        className="btn secondary"
        disabled={!date || data.demo || ["Won", "Lost"].includes(lead.stage)}
        onClick={async () => {
          if (!(await onSchedule(date)))
            setNotice("Could not schedule. Review the error and retry.");
        }}
      >
        Schedule task
      </button>
      <p role="status">{notice}</p>
      {!["Won", "Lost"].includes(lead.stage) && (
        <details>
          <summary>Generate itinerary & quote draft</summary>
          <p>
            Agency records supply all rates. Narrative is editable; no live AI
            is used by this package-based draft builder.
          </p>
          {suggestions.length === 0 && (
            <p>
              No matching destination package. Ask a manager to maintain a
              package and rates first.
            </p>
          )}
          <label>
            Suitable package
            <select
              value={packageId}
              onChange={(e) => {
                setPackageId(e.target.value);
                setProposal("");
              }}
            >
              <option value="">Choose a recorded package</option>
              {suggestions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {suggestions.find((s) => s.id === packageId)?.reason}
          <p>
            Recorded agency data:{" "}
            {p
              ? `${p.hotelCategory || "Hotel category not recorded"}; inclusions: ${p.inclusions}; exclusions: ${p.exclusions}`
              : "Select a package."}
          </p>
          <p>
            Requires confirmation: availability, room quantities/basis, missing
            hotel/rate details and tax configuration. Payment terms:{" "}
            {p?.paymentTerms || "Not recorded"}. Cancellation terms:{" "}
            {p?.cancellationTerms || "Not recorded"}. {p?.rateNotes}
          </p>
          <button
            disabled={!p}
            className="btn secondary"
            onClick={() =>
              setProposal(
                p!.itinerary ||
                  Array.from(
                    { length: p!.days },
                    (_, i) =>
                      `Day ${i + 1}: Activities and supplier details to be confirmed.`,
                  ).join("\n"),
              )
            }
          >
            Prepare package-based itinerary
          </button>
          <label>
            Editable customer proposal
            <textarea
              maxLength={12000}
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
            />
          </label>
          <button
            disabled={!p || !proposal || data.demo}
            className="btn primary"
            onClick={() => onQuote({ packageId, proposal })}
          >
            Review deterministic quotation
          </button>
          <p>
            Existing per-traveller rates apply; no room-based or flight rates
            are invented. Tax and discount require explicit salesperson review.
            Saving creates a new snapshot version; approve it before sharing.
          </p>
        </details>
      )}
    </section>
  );
}
