"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Plus } from "lucide-react";
import { readApiJson } from "@/lib/api-response";
import type { BusinessAnswer } from "@/lib/business-assistant/service";
export default function BusinessRecordAssistant({
  kind,
  businessId,
  month,
}: {
  kind: "HOTEL" | "TRANSPORT";
  businessId: string;
  month: string;
}) {
  const [question, setQuestion] = useState(""),
    [language, setLanguage] = useState("en"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [turns, setTurns] = useState<
      { id: string; question: string; answer: BusinessAnswer }[]
    >([]);
  const active = useRef(true),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  async function ask() {
    if (busy || !question.trim()) return;
    setBusy(true);
    setError("");
    const text = question.trim();
    controller.current = new AbortController();
    try {
      const answer = await readApiJson<BusinessAnswer>(
        await fetch("/api/assistant/business", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.current.signal,
          body: JSON.stringify({
            kind,
            businessId,
            month,
            language,
            question: text,
          }),
        }),
      );
      if (active.current) {
        setTurns((old) =>
          [...old, { id: crypto.randomUUID(), question: text, answer }].slice(
            -6,
          ),
        );
        setQuestion("");
      }
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section
      className="ops-record-assistant"
      aria-label="Business operational assistant"
    >
      <header>
        <div>
          <span className="eyebrow">
            <Sparkles size={15} /> YOUR BUSINESS, EXPLAINED
          </span>
          <h3>Ask about your operations</h3>
          <p>Guided records · {month} · no paid AI</p>
        </div>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            setTurns([]);
            setQuestion("");
            setError("");
          }}
        >
          <Plus size={15} />
          New conversation
        </button>
      </header>
      <p>
        Review your selected business’s recorded revenue, booked occupancy or
        fleet utilisation and planning results. This assistant performs no
        booking, payment, refund or outgoing message.
      </p>
      <div className="ops-assistant-prompts">
        {[
          ["Business summary", "Show my business summary"],
          ["Recorded revenue", "Show my recorded revenue"],
          [
            kind === "HOTEL" ? "Booked occupancy" : "Fleet utilisation",
            kind === "HOTEL"
              ? "Show my booked occupancy"
              : "Show my fleet utilisation",
          ],
          ["Planning outlook", "Show my demand forecast"],
        ].map(([label, text]) => (
          <button
            className="btn secondary"
            key={label}
            disabled={busy}
            onClick={() => setQuestion(text)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="log"
        aria-label="Business conversation"
        aria-live="polite"
        aria-relevant="additions"
      >
        {turns.map((t) => (
          <article className="ops-assistant-turn" key={t.id}>
            <p className="ops-assistant-question">
              <strong>You</strong> · {t.question}
            </p>
            <h4>{t.answer.title}</h4>
            <p>{t.answer.summary}</p>
            <dl>
              {t.answer.facts.map((f, i) => (
                <div key={i}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
            <details>
              <summary>Source & reporting basis</summary>
              <p>
                {t.answer.source} · {t.answer.month} ·{" "}
                {new Date(t.answer.asOf).toLocaleString("en-IN")}
              </p>
              <p>{t.answer.note}</p>
            </details>
          </article>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label>
          Response language
          <select
            value={language}
            disabled={busy}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="hi">Hindi / हिन्दी</option>
          </select>
        </label>
        <label>
          Your business question
          <textarea
            value={question}
            disabled={busy}
            maxLength={500}
            required
            placeholder="How is my business doing this month?"
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={busy || !question.trim()}>
          <Send size={15} />
          {busy ? "Checking permitted records…" : "Ask about records"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <small>
        Last six replies on this screen only. Changing business or reporting
        month, or leaving this section, clears the conversation. Earlier replies
        are dated snapshots. Do not enter identity documents or card/bank
        details.
      </small>
    </section>
  );
}
