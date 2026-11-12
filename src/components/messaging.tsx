"use client";
import { useEffect, useState } from "react";
import type { Dataset } from "@/lib/data";
import type { messagingOverview } from "@/lib/messaging/service";
type Report = Awaited<ReturnType<typeof messagingOverview>>;
const purposes = [
  "BOOKING_CONFIRMATION",
  "PAYMENT_REMINDER",
  "DEPARTURE_REMINDER",
  "CUSTOMER_SERVICE",
];
export default function Messaging({ data }: { data: Dataset }) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(""),
    [booking, setBooking] = useState(""),
    [kind, setKind] = useState("BOOKING_CONFIRMATION");
  async function refresh() {
    if (data.demo) return;
    try {
      const r = await fetch("/api/messaging", {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      setReport(b);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, [data.demo]);
  async function action(action: string, input: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/messaging", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, input }),
          signal: AbortSignal.timeout(25000),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      setNotice(b.message || "Saved");
      if (b.text) setPreview(`Recipient: +${b.phone}\n${b.text}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="assistant-card">
      <h2>Official WhatsApp messaging</h2>
      <p>
        The manual Open in WhatsApp button remains available separately.
        Official API sending requires approved business/number setup, customer
        opt-in, approved mapped templates and explicit live-send authorization.
      </p>
      <p>
        {report?.liveApproved
          ? "Global sending authorization configured; agency settings and consent still apply."
          : "Live sending is blocked. Preview and configuration only; no automatic customer communications."}
      </p>
      {data.demo && (
        <p>Read-only demo. No provider connection or message can be created.</p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <h3>Authorized sending channels</h3>
      {!report?.channels.length && (
        <p>
          No authorized channel. The service administrator must provision the
          agency-authorized number securely; never paste tokens or unrestricted
          keys here.
        </p>
      )}
      {report?.channels.map((c) => (
        <div className="priority-row" key={c.id}>
          <p>
            {c.displayPhone} ·{" "}
            {c.enabled ? "Agency enabled" : "Agency disabled"}
          </p>
          <button
            className="btn secondary"
            disabled={busy || !report.owner}
            onClick={() =>
              action("config", {
                action: "channel",
                id: c.id,
                enabled: !c.enabled,
              })
            }
          >
            {c.enabled ? "Disable channel" : "Enable agency channel"}
          </button>
          <button
            className="btn secondary"
            disabled={busy || !report.owner}
            onClick={() => action("templates", { id: c.id })}
          >
            Sync approved templates
          </button>
        </div>
      ))}
      <h3>Record customer consent</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void action("consent", {
            phone: f.get("phone"),
            optedIn: f.get("optedIn") === "on",
            evidence: f.get("evidence"),
          });
        }}
      >
        <div className="assistant-controls">
          <label>
            Customer international phone
            <input name="phone" required placeholder="+91…" />
          </label>
          <label>
            Consent evidence/source
            <textarea
              name="evidence"
              minLength={10}
              maxLength={500}
              required
              placeholder="Where, when and for what notifications the customer explicitly opted in or out. No documents or credentials."
            />
          </label>
          <label>
            <input name="optedIn" type="checkbox" />
            Explicit opt-in confirmed (unchecked records opt-out)
          </label>
          <button
            className="btn secondary"
            disabled={data.demo || busy || !report?.owner}
          >
            Save consent evidence
          </button>
        </div>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Phone</th>
              <th>Current consent</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {report?.consents.map((c) => (
              <tr key={c.id}>
                <td>+{c.phone}</td>
                <td>{c.optedIn ? "Opted in" : "Opted out"}</td>
                <td>{new Date(c.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Template review and mapping</h3>
      <p>
        Only provider-approved supported text templates can be mapped. Slots
        must match approved placeholder order. One template per channel/purpose
        is selected; verify commercial wording and language before enabling
        automation.
      </p>
      {report?.templates.map((t) => (
        <details key={t.id}>
          <summary>
            {t.name} · {t.language} · {t.status} · {t.purpose || "Not mapped"}
          </summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{t.body}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action("config", {
                action: "template",
                id: t.id,
                purpose: f.get("purpose"),
                slots: String(f.get("slots") || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
            }}
          >
            <div className="assistant-controls">
              <label>
                Notification purpose
                <select name="purpose" defaultValue={t.purpose || purposes[0]}>
                  {purposes.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Ordered field names
                <input
                  name="slots"
                  defaultValue={(t.slots as string[]).join(",")}
                  placeholder="customer,amount,dueDate"
                />
              </label>
              <button
                className="btn secondary"
                disabled={busy || !report.owner || t.status !== "APPROVED"}
              >
                Save reviewed mapping
              </button>
            </div>
            <p>
              {t.parameterCount} parameters. Allowed fields: customer,
              bookingId, packageName, travelStart, dueDate, amount, status.
            </p>
          </form>
        </details>
      ))}
      <h3>Review a booking notification</h3>
      <div className="assistant-controls">
        <label>
          Booking
          <select
            aria-label="Notification booking"
            value={booking}
            onChange={(e) => {
              setBooking(e.target.value);
              setPreview("");
            }}
          >
            <option value="">Select a booking</option>
            {data.bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {data.leads.find((l) => l.id === b.leadId)?.customer} · {b.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Purpose
          <select
            aria-label="Notification purpose"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPreview("");
            }}
          >
            {purposes.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button
          className="btn secondary"
          disabled={data.demo || busy || !booking || !report?.owner}
          onClick={() => action("preview", { id: booking, purpose: kind })}
        >
          Preview notification
        </button>
        <button
          className="btn primary"
          disabled={
            data.demo ||
            busy ||
            !preview ||
            !booking ||
            !report?.owner ||
            !report.liveApproved
          }
          onClick={() => {
            if (
              confirm(
                "Queue this reviewed notification for the opted-in customer? It will be checked again before sending.",
              )
            )
              void action("queue", { id: booking, purpose: kind });
          }}
        >
          Queue reviewed notification
        </button>
      </div>
      {preview && <pre style={{ whiteSpace: "pre-wrap" }}>{preview}</pre>}
      <h3>Delivery and failures</h3>
      {report?.notifications.map((n) => (
        <p key={n.id}>
          {n.purpose} · {n.bookingId} · {n.status} {n.errorCode}
        </p>
      ))}
      <p>
        Queued/accepted is not delivered. UNKNOWN or stranded SENDING requires
        provider reconciliation; do not retry blindly. Payment links remain
        unavailable while Razorpay is deferred.
      </p>
    </section>
  );
}
