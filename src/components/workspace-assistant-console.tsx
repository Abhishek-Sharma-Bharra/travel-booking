"use client";
import VoiceInput from "./voice-input";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  Send,
  ClipboardCheck,
  MessageCircle,
  Plus,
} from "lucide-react";
import type { Dataset } from "@/lib/data";
import { readApiJson } from "@/lib/api-response";
import { tools, type ToolResult } from "@/lib/workspace-assistant/contracts";
import type { workspaceAssistantStatus } from "@/lib/workspace-assistant/service";
type Status = Awaited<ReturnType<typeof workspaceAssistantStatus>>;
const labels = {
  help: "What can the assistant do?",
  auto: "Choose from my question",
  packages: "Maintained packages",
  lead: "Selected enquiry",
  itinerary: "Itinerary draft",
  quotation: "Quotation preview",
  followups: "Follow-up help",
  booking: "Booking status",
  suppliers: "Supplier availability",
  payment: "Payment readiness",
};
export default function WorkspaceAssistantConsole({
  data,
  onReview,
}: {
  data: Dataset;
  onReview: (result: ToolResult) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [question, setQuestion] = useState(""),
    [tool, setTool] = useState("auto"),
    [mode, setMode] = useState("GUIDED"),
    [language, setLanguage] = useState("en"),
    [leadId, setLeadId] = useState(""),
    [packageId, setPackageId] = useState(""),
    [bookingId, setBookingId] = useState(""),
    [kind, setKind] = useState("HOTEL"),
    [city, setCity] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [result, setResult] = useState<ToolResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [turns, setTurns] = useState<
    {
      id: string;
      question: string;
      context: string;
      response?: string;
      asOf?: string;
      failed?: boolean;
    }[]
  >([]);
  const pending = useRef<{ body: string; key: string } | null>(null),
    mounted = useRef(true);
  const messageLog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const log = messageLog.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns]);
  async function load() {
    try {
      const r = await readApiJson<Status>(
        await fetch("/api/assistant/workspace", { cache: "no-store" }),
      );
      if (mounted.current) setStatus(r);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, []);
  const needsLead = [
      "lead",
      "itinerary",
      "quotation",
      "followups",
      "auto",
    ].includes(tool),
    needsPackage = ["itinerary", "quotation", "auto"].includes(tool),
    needsBooking = ["booking", "payment", "auto"].includes(tool),
    needsSupplier = ["suppliers", "auto"].includes(tool);
  async function run() {
    setBusy(true);
    setError("");
    setNotice("");
    setResult(null);
    const command = {
      mode,
      tool,
      question,
      language,
      ...(leadId ? { leadId } : {}),
      ...(packageId ? { packageId } : {}),
      ...(bookingId ? { bookingId } : {}),
      supplierKind: kind,
      city,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    };
    const body = JSON.stringify(command);
    if (pending.current?.body !== body)
      pending.current = { body, key: crypto.randomUUID() };
    const turnId = pending.current.key;
    const context = [
      data.leads.find((l) => l.id === leadId)?.customer,
      data.packages.find((p) => p.id === packageId)?.name,
      bookingId ? "Selected booking" : "",
      needsSupplier ? [kind, city, start, end].filter(Boolean).join(" · ") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    setTurns((old) =>
      [
        ...old.filter((t) => t.id !== turnId),
        {
          id: turnId,
          question: question.trim() || labels[tool as keyof typeof labels],
          context,
        },
      ].slice(-12),
    );
    try {
      const response = await readApiJson<{ result: ToolResult }>(
        await fetch("/api/assistant/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...command, requestId: pending.current.key }),
        }),
      );
      if (mounted.current) {
        setResult(response.result);
        setTurns((old) =>
          old.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  response: response.result.summary,
                  asOf: response.result.asOf,
                }
              : t,
          ),
        );
        pending.current = null;
        setTool("auto");
        setQuestion("");
      }
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        setTurns((old) =>
          old.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  response:
                    "This lookup was not confirmed. Check usage before starting another lookup; no chat action confirms a booking or payment.",
                  failed: true,
                }
              : t,
          ),
        );
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
        void load();
      }
    }
  }
  function edit(fn: () => void) {
    fn();
    setResult(null);
    setNotice("");
  }
  return (
    <section
      className="studio-assistant"
      aria-label="Grounded workspace assistant"
    >
      <header>
        <div className="studio-assistant-icon">
          <Sparkles size={23} />
        </div>
        <div>
          <span className="studio-eyebrow">
            A THOUGHTFUL SECOND PAIR OF EYES
          </span>
          <h2>Your records. A clearer next step.</h2>
          <p>
            Search, understand and prepare. Every customer-facing action stays
            yours to review.
          </p>
        </div>
      </header>
      <div className="studio-assistant-body">
        <div className="conversation-toolbar">
          <span>
            <MessageCircle size={17} /> Your workspace conversation
          </span>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              pending.current = null;
              setTurns([]);
              setResult(null);
              setQuestion("");
              setError("");
              setLeadId("");
              setPackageId("");
              setBookingId("");
              setCity("");
              setStart("");
              setEnd("");
              setKind("HOTEL");
              setTool("auto");
              setMode("GUIDED");
              setNotice(
                "Conversation and selected context cleared from this screen. Usage records are retained; no business records were deleted.",
              );
            }}
          >
            <Plus size={15} /> New conversation
          </button>
        </div>
        <div
          ref={messageLog}
          className="conversation-messages"
          role="log"
          aria-label="Conversation messages"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {!turns.length && (
            <div className="conversation-welcome">
              <Sparkles size={30} />
              <h3>What shall we work on today?</h3>
              <p>
                Ask in English or Hindi. I use your permitted records and show
                what needs your review.
              </p>
              <div className="conversation-prompts">
                {[
                  [
                    "packages",
                    "Show my packages",
                    "Show my maintained packages",
                  ],
                  [
                    "followups",
                    "Plan my follow-ups",
                    "Which follow-ups need attention?",
                  ],
                  [
                    "quotation",
                    "Prepare a quotation",
                    "Prepare a quotation preview for the selected enquiry and package",
                  ],
                  ["help", "What can you do?", "What can you do?"],
                ].map(([value, label, prompt]) => (
                  <button
                    key={value}
                    className="btn secondary"
                    disabled={busy}
                    onClick={() =>
                      edit(() => {
                        setTool(value);
                        setQuestion(prompt);
                      })
                    }
                  >
                    {label}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t) => (
            <div className="conversation-turn" key={t.id}>
              <div className="conversation-user">
                <span>You</span>
                <p>{t.question}</p>
                {t.context && <small>Context: {t.context}</small>}
              </div>
              <div className="conversation-reply">
                <span>
                  <Sparkles size={14} /> Vashisht assistant
                </span>
                <p>{t.response || "Checking permitted records…"}</p>
                {t.failed && <small>Result not confirmed</small>}
                {t.asOf && (
                  <small>
                    Lookup at {new Date(t.asOf).toLocaleString("en-IN")}
                  </small>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="conversation-retention">
          Last 12 lookups on this screen only. Refreshing, leaving this section
          or starting a new conversation clears the transcript. Earlier replies
          are dated lookups; each new request uses the selected context, not
          hidden conversation memory.
        </p>
        {result && (
          <article className="studio-tool-result">
            <div className="studio-result-source">
              <ShieldCheck size={15} />
              {result.source} · {new Date(result.asOf).toLocaleString("en-IN")}
            </div>
            <h3>{result.title}</h3>
            <ul>
              {result.items.map((item, i) => (
                <li key={item.id + ":" + i}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
            {result.draft && <pre>{result.draft.text}</pre>}
            <p className="studio-result-note">{result.note}</p>
            <div className="studio-assistant-actions">
              {result.next && (
                <button
                  className="btn primary"
                  onClick={() => onReview(result)}
                >
                  <ArrowUpRight size={16} />
                  {result.draft
                    ? "Review in existing workflow"
                    : "Open related workspace"}
                </button>
              )}
              {result.tool === "suppliers" && (
                <a className="btn secondary" href="/marketplace">
                  Open marketplace for a verified quote
                </a>
              )}
              {result.draft && (
                <button
                  className="btn secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(result.draft!.text);
                      setNotice(
                        "Draft copied. Review before sharing; no message was sent.",
                      );
                    } catch {
                      setNotice(
                        "Copy is unavailable. Your draft remains visible for manual review.",
                      );
                    }
                  }}
                >
                  <ClipboardCheck size={16} />
                  Copy draft for review
                </button>
              )}
            </div>
          </article>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <fieldset disabled={busy}>
            <div className="studio-assistant-modes">
              <label>
                Assistant mode
                <select
                  value={mode}
                  onChange={(e) =>
                    edit(() => {
                      setMode(e.target.value);
                      if (e.target.value === "LIVE") setTool("auto");
                    })
                  }
                >
                  <option value="GUIDED">Guided tools · no paid AI</option>
                  <option value="LIVE" disabled={!status?.liveEnabled}>
                    Live AI routing
                    {!status?.liveEnabled ? " · not enabled" : ""}
                  </option>
                </select>
              </label>
              <label>
                Response language
                <select
                  value={language}
                  onChange={(e) => edit(() => setLanguage(e.target.value))}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi / हिन्दी</option>
                </select>
              </label>
            </div>
            <label>
              What would you like to review?
              <select
                value={tool}
                disabled={mode === "LIVE"}
                onChange={(e) => edit(() => setTool(e.target.value))}
              >
                {["auto", ...tools].map((t) => (
                  <option key={t} value={t}>
                    {labels[t as keyof typeof labels]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Your question <span>(optional for guided tools)</span>
              <textarea
                value={question}
                maxLength={1000}
                onChange={(e) => edit(() => setQuestion(e.target.value))}
                placeholder="Which enquiries need a follow-up? / Aaj kin enquiries par baat karun?"
              />
            </label>
            <VoiceInput language={language} disabled={busy} onText={text=>edit(()=>setQuestion(text))}/>
            <div className="studio-assistant-fields">
              {needsLead && (
                <label>
                  Enquiry context
                  <select
                    value={leadId}
                    onChange={(e) => edit(() => setLeadId(e.target.value))}
                  >
                    <option value="">Choose when needed</option>
                    {data.leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.customer} · {l.destination}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {needsPackage && (
                <label>
                  Package context
                  <select
                    value={packageId}
                    onChange={(e) => edit(() => setPackageId(e.target.value))}
                  >
                    <option value="">Choose when needed</option>
                    {data.packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.destination}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {needsBooking && (
                <label>
                  Booking context
                  <select
                    value={bookingId}
                    onChange={(e) => edit(() => setBookingId(e.target.value))}
                  >
                    <option value="">Choose when needed</option>
                    {data.bookings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {data.leads.find((l) => l.id === b.leadId)?.customer} ·{" "}
                        {b.quote.destination}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {needsSupplier && (
              <div className="studio-assistant-fields">
                <label>
                  Supplier service
                  <select
                    value={kind}
                    onChange={(e) => edit(() => setKind(e.target.value))}
                  >
                    <option value="HOTEL">Hotel</option>
                    <option value="BUS">Bus charter</option>
                    <option value="CAR">Car rental</option>
                  </select>
                </label>
                <label>
                  Supplier city
                  <input
                    value={city}
                    maxLength={80}
                    onChange={(e) => edit(() => setCity(e.target.value))}
                  />
                </label>
                <label>
                  Supplier start date
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => edit(() => setStart(e.target.value))}
                  />
                </label>
                <label>
                  Supplier end date
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => edit(() => setEnd(e.target.value))}
                  />
                </label>
              </div>
            )}
            <div className="studio-assistant-actions">
              <button
                className="btn primary"
                disabled={!status || busy}
                type="submit"
              >
                <Send size={15} />
                {busy ? "Reviewing your records…" : "Send message"}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  pending.current = null;
                  setResult(null);
                  setError("");
                  setNotice(
                    "Ready for a new lookup. Live routing, when enabled, consumes a new usage allowance.",
                  );
                }}
              >
                Start a new lookup
              </button>
            </div>
          </fieldset>
        </form>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="info-box">
            {notice}
          </p>
        )}
        {status && (
          <details className="studio-usage">
            <summary>Assistant usage & privacy</summary>
            <p>
              {status.usage.scope} · {status.usage.window}. Live routing:{" "}
              {status.liveEnabled ? "enabled" : "disabled"}.
            </p>
            <ul>
              {status.usage.rows.map((r) => (
                <li key={r.mode + r.state}>
                  {r.mode} · {r.state}: {r.calls} requests ·{" "}
                  {r.tokens.toLocaleString("en-IN")} reported/reserved tokens
                </li>
              ))}
            </ul>
            <p>
              Guided allowance {status.usage.limits.guidedDaily}/agency/day.
              Live allowance up to {status.usage.limits.liveDaily}/agency/day,{" "}
              {status.usage.limits.liveHourlyPerUser}/user/hour, within{" "}
              {status.usage.limits.dailyTokens.toLocaleString("en-IN")}{" "}
              tokens/day.
            </p>
            <p>{status.usage.costNote}</p>
            <p>
              Questions and drafts are not stored in this usage journal. Live
              routing receives a minimized question, not your CRM dataset. Omit
              identity documents, bank/card information and unnecessary personal
              details.
            </p>
          </details>
        )}
      </div>
    </section>
  );
}
