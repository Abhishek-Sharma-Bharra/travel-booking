"use client";
import { useEffect, useState } from "react";
import type { Dataset } from "@/lib/data";
import type { automationOverview } from "@/lib/automation/service";
type Report = Awaited<ReturnType<typeof automationOverview>>;
const labels = {
  enabled: "Enable automation",
  ads: "Daily advertising spend sync",
  reminders: "Payment and departure reminders",
  notifications: "Booking confirmations",
  summaries: "Internal daily KPI summaries",
  alerts: "Internal integration alerts",
};
export default function Automation({ data }: { data: Dataset }) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    if (data.demo) return;
    try {
      const r = await fetch("/api/automation", { cache: "no-store" }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      setReport(b);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [data.demo]);
  async function act(action: string, input: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, input }),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      setNotice(b.message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="feature-page automation-page">
      <section className="panel prose">
        <h2>Agency automation</h2>
        <p>
          Jobs are persisted, retried with backoff, and isolated by agency.
          Queued work requires a scheduled runner. Summaries and alerts stay
          inside this workspace. Razorpay payment reconciliation is deferred.
        </p>
        <p>
          Official WhatsApp requires approved templates, customer opt-in and
          separate operator authorization. No real messages are enabled by this
          update.
        </p>
        {data.demo && <p>Demo: automation configuration is read-only.</p>}
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        <form
          className="automation-policy"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(
              "policy",
              Object.fromEntries(
                Object.keys(labels).map((k) => [k, f.get(k) === "on"]),
              ),
            );
          }}
          key={report?.policy?.revision ?? "new"}
        >
          {Object.entries(labels).map(([key, label]) => (
            <label key={key} className="automation-option">
              <input
                type="checkbox"
                name={key}
                disabled={!report?.owner || busy || data.demo}
                defaultChecked={Boolean(
                  report?.policy?.[key as keyof typeof labels],
                )}
              />{" "}
              {label}
            </label>
          ))}
          <button
            className="btn primary"
            disabled={!report?.owner || busy || data.demo}
          >
            Save automation controls
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Execution history and failed jobs</h2>
          <button
            className="btn"
            onClick={() => void load()}
            disabled={busy || data.demo}
          >
            Refresh history
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Result / safe error</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {report?.jobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.kind}</td>
                  <td>{j.status}</td>
                  <td>{j.attempts}</td>
                  <td>
                    <details>
                      <summary>{j.errorCode || "View recorded result"}</summary>
                      <pre style={{ whiteSpace: "pre-wrap", maxWidth: 600 }}>
                        {JSON.stringify(j.result, null, 2)}
                      </pre>
                    </details>
                  </td>
                  <td>
                    {["DEAD", "BLOCKED"].includes(j.status) &&
                      !["WHATSAPP_SEND", "PLAN_MESSAGES"].includes(j.kind) && (
                        <button
                          className="btn"
                          disabled={!report.owner || busy}
                          onClick={() => void act("retry", { id: j.id })}
                        >
                          Retry safe job
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report?.jobs.length && <p>No automation executions recorded.</p>}
        <p>
          Message jobs with uncertain outcomes require provider reconciliation.
          They cannot be blindly retried.
        </p>
      </section>
    </div>
  );
}
