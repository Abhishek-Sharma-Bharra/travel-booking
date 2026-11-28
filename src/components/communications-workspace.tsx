"use client";
import { useEffect, useState } from "react";
export default function CommunicationsWorkspace() {
  const [data, setData] = useState<any>(null),
    [bookings, setBookings] = useState<any[]>([]),
    [templates, setTemplates] = useState<any[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [bookingId, setBookingId] = useState("");
  async function call(action: string, input?: unknown) {
    const r = await fetch("/api/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input }),
      }),
      v = await r.json();
    if (!r.ok) throw Error(v.error);
    return v;
  }
  async function load() {
    for (const [url, update] of [
      ["/api/communications", setData],
      ["/api/commerce", (v: any) => setBookings(v.bookings)],
    ] as const) {
      const r = await fetch(url, { cache: "no-store" }),
        v = await r.json();
      if (r.ok) update(v);
      else setNotice(v.error);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content commerce-workspace">
      <a href="/workspace/commerce">← Accounts & customer portal</a>
      <h1>Official WhatsApp</h1>
      <p>
        Approved text templates only. Record customer opt-in before sending.
        Media/button templates and bulk campaigns are not enabled in this pilot.
      </p>
      {notice && (
        <p role="status" className="info-box">
          {notice}
        </p>
      )}
      <section className="panel">
        <h2>Business connection</h2>
        <p>
          {data?.channel
            ? data.channel.displayPhone
            : "No official number connected"}{" "}
          · Live delivery: {data?.liveApproved ? "approved" : "disabled"}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await call("CONNECT", {
                wabaId: String(f.get("wabaId")),
                phoneId: String(f.get("phoneId")),
                token: String(f.get("token")),
                authorised: true,
              });
              await load();
              (e.target as HTMLFormElement).reset();
              setNotice(
                "Authorised business number connected. Access token is stored encrypted.",
              );
            });
          }}
        >
          <label>
            WhatsApp Business Account ID
            <input name="wabaId" required autoComplete="off" />
          </label>
          <label>
            Phone number ID
            <input name="phoneId" required autoComplete="off" />
          </label>
          <label>
            Business access token
            <input type="password" name="token" required autoComplete="off" />
          </label>
          <label>
            <input type="checkbox" required /> I own or am authorised to connect
            this business number.
          </label>
          <button
            className="btn secondary"
            disabled={busy || !data?.provisionApproved}
          >
            Connect authorised number
          </button>
        </form>
        <p>
          Connection requires platform Meta approval. Never send access tokens
          in support chat.
        </p>
      </section>
      <section className="panel">
        <h2>Customer consent</h2>
        <label>
          Booking
          <select
            value={bookingId}
            onChange={(e) => {
              setBookingId(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Select booking</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.lead.customer}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await call("CONSENT", {
                bookingId,
                purpose: String(f.get("purpose")),
                optedIn: f.get("optedIn") === "on",
                evidence: String(f.get("evidence")),
              });
              setNotice(
                "Consent record saved. Changing the customer's phone requires a new consent record.",
              );
            });
          }}
        >
          <label>
            Purpose
            <select name="purpose">
              <option value="SERVICE">Service messages</option>
              <option value="MARKETING">Marketing messages</option>
            </select>
          </label>
          <label>
            Consent evidence / source
            <textarea name="evidence" required minLength={10} maxLength={600} />
          </label>
          <label>
            <input name="optedIn" type="checkbox" /> Customer opted in (uncheck
            to revoke)
          </label>
          <button className="btn secondary" disabled={busy || !bookingId}>
            Save consent record
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Review a template message</h2>
        <button
          className="btn secondary"
          disabled={busy || !data?.channel}
          onClick={() =>
            run(async () => {
              setTemplates((await call("TEMPLATES")).templates);
            })
          }
        >
          Load approved templates
        </button>
        <form
          onChange={() => setPreview(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              t = templates[Number(f.get("template"))];
            void run(async () => {
              if (!t) throw Error("Choose a template");
              const input = {
                requestId: crypto.randomUUID(),
                bookingId,
                template: t.name,
                language: t.language,
                slots: String(f.get("slots") || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                reviewed: true,
              };
              const p = await call("PREVIEW", input);
              setPreview({ ...p, input });
            });
          }}
        >
          <label>
            Template
            <select name="template" required>
              <option value="">Select template</option>
              {templates.map((t, i) => (
                <option key={i} value={i}>
                  {t.name} · {t.language} · {t.category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Parameter mapping in order
            <input name="slots" placeholder="customer, agency, bookingId" />
          </label>
          <p>
            Supported fields: customer, agency, bookingId, travelStart, total.
            Use one comma-separated field per numbered template placeholder.
          </p>
          <button className="btn secondary" disabled={busy || !bookingId}>
            Preview message
          </button>
        </form>
        {preview && (
          <>
            <p style={{ whiteSpace: "pre-wrap" }}>{preview.text}</p>
            <p>
              Recipient: +{preview.phone} · {preview.purpose}
            </p>
            <button
              className="btn primary"
              disabled={busy || !data?.liveApproved}
              onClick={() =>
                run(async () => {
                  const r = await call("SEND", preview.input);
                  setNotice(
                    "Delivery state: " +
                      r.state +
                      ". An uncertain result must not be resent.",
                  );
                  await load();
                })
              }
            >
              Send reviewed template
            </button>
          </>
        )}
      </section>
      <section className="panel">
        <h2>Delivery records</h2>
        {data?.outbox?.map((r: any) => (
          <p key={r.id}>
            {r.template} · {r.state} · {r.createdAt}
          </p>
        ))}
      </section>
    </main>
  );
}
