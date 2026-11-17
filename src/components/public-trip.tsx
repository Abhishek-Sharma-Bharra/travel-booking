"use client";
import { useState } from "react";
import {
  Compass,
  ArrowUpRight,
  Check,
  MessageCircle,
  CalendarDays,
  Users,
  ShieldCheck,
} from "lucide-react";
import type { PublicCampaign } from "@/lib/campaigns/contracts";
import { priceSummary } from "@/lib/campaigns/contracts";
import { inr, indiaToday } from "@/lib/money";
import styles from "./trip-sales.module.css";
export default function PublicTrip({ campaign }: { campaign: PublicCampaign }) {
  const [selected, setSelected] = useState(campaign.offers[0].id),
    [travellers, setTravellers] = useState(2),
    [language, setLanguage] = useState<"English" | "Hindi" | "Hinglish">(
      "Hinglish",
    ),
    [aiConsent, setAiConsent] = useState(false),
    [message, setMessage] = useState(""),
    [messages, setMessages] = useState<{ role: string; text: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState("Package guide"),
    [reference, setReference] = useState(""),
    [requestId] = useState(() => crypto.randomUUID());
  const offer = campaign.offers.find((p) => p.id === selected)!,
    maxTravellers = Math.min(
      30,
      Math.max(
        1,
        Math.floor(2000000000 / (offer.price * (1 + campaign.taxBps / 10000))),
      ),
    ),
    count = Math.min(travellers, maxTravellers),
    price = priceSummary(offer, count, campaign.taxBps);
  async function send(text = message) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const history = messages
      .filter((m) => m.role === "customer")
      .slice(-4)
      .map((m) => m.text.slice(0, 500));
    setMessages((m) => [...m, { role: "customer", text }]);
    try {
      const response = await fetch(`/api/public/trips/${campaign.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          input: {
            message: text,
            language,
            packageId: selected,
            travellers: count,
            aiConsent,
            history,
          },
        }),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error || "Please retry.");
      setMessages((m) => [...m, { role: "assistant", text: value.reply }]);
      setMode(value.mode);
      if (value.packageId) setSelected(value.packageId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function request(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const q = new URLSearchParams(location.search);
    try {
      const response = await fetch(`/api/public/trips/${campaign.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          input: {
            requestId,
            revision: campaign.revision,
            packageId: selected,
            customer: form.get("customer"),
            phone: form.get("phone"),
            email: form.get("email") || "",
            travelStart: form.get("travelStart"),
            travellers: count,
            consent: form.get("consent") === "on",
            website: form.get("website") || "",
            attribution: {
              source: (q.get("utm_source") || "").slice(0, 100),
              medium: (q.get("utm_medium") || "").slice(0, 100),
              campaign: (q.get("utm_campaign") || "").slice(0, 100),
              content: (q.get("utm_content") || "").slice(0, 100),
            },
          },
        }),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error || "Please retry.");
      setReference(value.reference);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.publicPage}>
      <header className={styles.header}>
        <span className={styles.logo}>
          <Compass size={28} />
          {campaign.agency}
        </span>
        <span className={styles.powered}>Powered by Vashisht TravelOS</span>
      </header>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>YOUR NEXT CHAPTER STARTS HERE</p>
          <h1>{campaign.title}</h1>
          <p>
            Explore thoughtfully planned journeys. Get clear package details,
            compare your options, and plan your next escape with{" "}
            {campaign.agency}.
          </p>
          <a href="#trip-options" className={styles.primary}>
            Find your journey <ArrowUpRight size={17} />
          </a>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.sun} />
          <svg viewBox="0 0 500 300">
            <path
              d="M0 300V180L95 70 190 185 280 30 500 250V300Z"
              fill="#496c74"
            />
            <path d="m235 100 45-70 65 83-54-17-18 20Z" fill="#e3e7df" />
            <path
              d="M0 300V235L155 130 285 245 385 145 500 230V300Z"
              fill="#293f4a"
            />
            <path
              d="M220 300q20-30 60-55t-5-42"
              stroke="#a2b9b0"
              strokeWidth="9"
              fill="none"
            />
          </svg>
          <span>LESS GUESSWORK. MORE DISCOVERY.</span>
        </div>
      </section>
      <div className={styles.trust}>
        <span>
          <ShieldCheck size={17} /> Agency-published packages
        </span>
        <span>
          <MessageCircle size={17} /> Hindi · English · Hinglish
        </span>
        <span>
          <Check size={17} /> Clear prices &amp; terms
        </span>
      </div>
      <div className={styles.columns} id="trip-options">
        <section>
          <p className={styles.eyebrow}>CURATED BY YOUR AGENCY</p>
          <h2>Choose where you belong.</h2>
          <div className={styles.offers}>
            {campaign.offers.map((p) => (
              <button
                type="button"
                key={p.id}
                aria-pressed={selected === p.id}
                onClick={() => setSelected(p.id)}
                className={`${styles.offer} ${selected === p.id ? styles.selected : ""}`}
              >
                <span>
                  {p.destination.toUpperCase()} · {p.days} DAYS
                </span>
                <strong>{p.name}</strong>
                <span>
                  {inr(p.price)} / person{" "}
                  <small>+ {campaign.taxBps / 100}% tax</small>
                </span>
              </button>
            ))}
          </div>
          <article className={styles.details}>
            <h2>{offer.name}</h2>
            <p>{offer.hotelCategory}</p>
            {[
              ["Your itinerary", offer.itinerary],
              ["Included", offer.inclusions],
              ["Not included", offer.exclusions],
              ["Payment terms", offer.paymentTerms],
              ["Cancellation policy", offer.cancellationTerms],
              ["Rate notes", offer.rateNotes],
            ].map(([name, value]) =>
              value ? (
                <details key={name} open={name === "Your itinerary"}>
                  <summary>{name}</summary>
                  <p>{value}</p>
                </details>
              ) : null,
            )}
          </article>
          <section className={styles.chat}>
            <div className={styles.sectionTitle}>
              <h2>Ask your travel assistant</h2>
              <span>{mode}</span>
            </div>
            <p>
              Ask about these packages, itineraries, inclusions, prices or
              cancellation terms. Do not share identity documents or payment
              details.
            </p>
            <label>
              Conversation language
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                <option>Hinglish</option>
                <option>English</option>
                <option>Hindi</option>
              </select>
            </label>
            {campaign.aiAvailable ? (
              <label className={styles.consent}>
                <input
                  type="checkbox"
                  checked={aiConsent}
                  onChange={(e) => setAiConsent(e.target.checked)}
                />
                Use AI to understand my questions. My chat text may be processed
                by OpenAI; contact details are collected separately.
              </label>
            ) : (
              <p className={styles.muted}>
                The package guide is available. Live AI is not connected for
                this environment.
              </p>
            )}
            <div className={styles.quick}>
              {[
                "Itinerary",
                "What is included?",
                "Cancellation policy",
                "Total price",
                "Talk to the agency",
              ].map((q) => (
                <button
                  type="button"
                  disabled={busy}
                  key={q}
                  onClick={() => send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className={styles.messages} aria-live="polite">
              {messages.slice(-12).map((m, i) => (
                <p
                  key={i}
                  className={
                    m.role === "customer" ? styles.customer : styles.assistant
                  }
                >
                  <small>
                    {m.role === "customer" ? "You" : "Travel assistant"}
                  </small>
                  {m.text}
                </p>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className={styles.chatForm}
            >
              <input
                aria-label="Ask about this trip"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1500}
                placeholder="Is package mein kya included hai?"
                required
              />
              <button className={styles.primary} disabled={busy}>
                {busy ? "Please wait…" : "Send"}
              </button>
            </form>
          </section>
        </section>
        <aside className={styles.booking}>
          <p className={styles.eyebrow}>LET’S PLAN YOUR TRIP</p>
          <h2>{reference ? "Request received" : "Make it your journey"}</h2>
          {reference ? (
            <div role="status">
              <ShieldCheck size={32} />
              <p>Your request is saved with {campaign.agency}.</p>
              <p>
                Reference: <strong>{reference}</strong>
              </p>
              <p>
                This is not a confirmed booking. The agency must verify
                availability and respond with next steps. No payment has been
                taken.
              </p>
            </div>
          ) : (
            <form onSubmit={request}>
              <p>{offer.name}</p>
              <label>
                <Users size={15} /> Travellers{" "}
                <small>
                  Same published per-person rate; child/group concessions
                  require agency review.
                </small>
                <input
                  aria-label="Travellers"
                  type="number"
                  min={1}
                  max={maxTravellers}
                  value={count}
                  onChange={(e) =>
                    setTravellers(
                      Math.min(
                        maxTravellers,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    )
                  }
                />
              </label>
              <dl className={styles.price}>
                <div>
                  <dt>Package subtotal</dt>
                  <dd>{inr(price.subtotal)}</dd>
                </div>
                <div>
                  <dt>Tax ({campaign.taxBps / 100}%)</dt>
                  <dd>{inr(price.tax)}</dd>
                </div>
                <div>
                  <dt>Published total</dt>
                  <dd>{inr(price.total)}</dd>
                </div>
              </dl>
              <label>
                <CalendarDays size={15} /> Preferred departure
                <input
                  name="travelStart"
                  type="date"
                  min={indiaToday()}
                  required
                />
              </label>
              <label>
                Your name
                <input
                  name="customer"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Phone with country code
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+919876543210"
                  pattern="\+[1-9][0-9]{7,14}"
                  required
                />
              </label>
              <label>
                Email <small>Optional</small>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                />
              </label>
              <div className={styles.honeypot} aria-hidden="true">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <label className={styles.consent}>
                <input name="consent" type="checkbox" required />I agree to the
                published package terms and ask this agency to contact me about
                this trip. This does not opt me into marketing.
              </label>
              <button className={styles.primary} disabled={busy}>
                {busy ? "Please wait…" : "Send booking request"}
                <ArrowUpRight size={16} />
              </button>
              <p className={styles.muted}>
                Subject to agency confirmation and supplier availability. No
                room or flight is held. Do not pay until you receive verified
                payment instructions.
              </p>
            </form>
          )}
          <p className={styles.muted}>
            Rates expire at{" "}
            {new Date(campaign.expiresAt).toLocaleString("en-IN", {
              timeZone: campaign.timezone,
            })}
            . <a href="/privacy">Privacy</a>
          </p>
        </aside>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      <footer className={styles.footer}>
        A journey offered by {campaign.agency}. Technology by Vashisht TravelOS.
      </footer>
    </main>
  );
}
