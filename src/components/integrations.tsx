"use client";
import { useEffect, useState } from "react";
import type { Dataset } from "@/lib/data";
import type { integrationOverview } from "@/lib/integrations/service";
import type { AdAccount } from "@/lib/integrations/meta";
type Overview = Awaited<ReturnType<typeof integrationOverview>>;
export default function Integrations({ data }: { data: Dataset }) {
  const [report, setReport] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [accounts, setAccounts] = useState<Record<string, AdAccount[]>>({}),
    [selected, setSelected] = useState<Record<string, string>>({}),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  async function refresh() {
    if (data.demo) return;
    try {
      const r = await fetch("/api/integrations", {
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error);
      setReport(body);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const result = new URLSearchParams(location.search).get("integration");
    if (result)
      setNotice(
        result === "connected"
          ? "Authorization received. Load and select an authorized account."
          : "Authorization failed or was declined. Start again.",
      );
  }, [data.demo]);
  async function action(action: string, input: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...input }),
          signal: AbortSignal.timeout(55000),
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error);
      if (action === "accounts")
        setAccounts((a) => ({ ...a, [String(input.id)]: body.accounts }));
      else {
        setNotice(body.message);
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(provider: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
          `/api/integrations/${provider.toLowerCase()}/start`,
          { method: "POST", signal: AbortSignal.timeout(15000) },
        ),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      location.assign(b.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="assistant-card feature-page integrations-page">
      <h2>Agency integrations</h2>
      <p>
        Connect only advertising accounts you are authorized to manage. Provider
        approval, scopes and private server configuration are required. No
        unrestricted secret keys are collected in this screen.
      </p>
      {data.demo && (
        <p>
          Read-only fictional demo. Provider connections, syncs and outbound
          messages are disabled.
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="provider-grid">
        {(["META", "GOOGLE"] as const).map((provider) => (
          <section
            className="assistant-card provider-card"
            data-provider={provider}
            key={provider}
          >
            <h3>{provider === "META" ? "Meta Ads" : "Google Ads"}</h3>
            <p>
              {report?.configured[provider]
                ? "Server configured; account authorization still required."
                : "Not configured. Ask the administrator to complete provider approvals and encryption setup."}
            </p>
            <button
              className="btn primary"
              disabled={
                data.demo ||
                busy ||
                data.actor.role !== "OWNER" ||
                !report?.configured[provider]
              }
              onClick={() => connect(provider)}
            >
              Connect {provider === "META" ? "Meta Ads" : "Google Ads"}
            </button>
          </section>
        ))}
      </div>
      <p>
        Advertising facts below preserve original currency and account timezone.
        They do not replace monthly manual spend automatically. Campaign-level
        CRM attribution/CPL is unavailable unless matched enquiry identifiers
        exist; no provider conversions are treated as CRM bookings.
      </p>
      {report?.connections.map((c) => (
        <section className="assistant-card" key={c.id}>
          <h3>
            {c.provider}: {c.accountName || "Select authorized account"}
          </h3>
          <p>
            {c.accountId || "Authorization pending selection"} · {c.status} ·{" "}
            {c.currency} · {c.timezone}
          </p>
          <p>
            Last successful sync:{" "}
            {c.lastSyncedAt
              ? new Date(c.lastSyncedAt).toLocaleString()
              : "Never"}
            . {c.errorCode && `Attention: ${c.errorCode}`}
          </p>
          {c.status === "SELECT_ACCOUNT" && (
            <div className="assistant-controls">
              <button
                className="btn secondary"
                disabled={busy || !report.owner}
                onClick={() => action("accounts", { id: c.id })}
              >
                Load authorized accounts
              </button>
              <label>
                Authorized account
                <select
                  aria-label={`Authorized account ${c.id}`}
                  value={selected[c.id] || ""}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [c.id]: e.target.value }))
                  }
                >
                  <option value="">Choose an account</option>
                  {accounts[c.id]?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.id} · {a.currency}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn secondary"
                disabled={busy || !selected[c.id] || !report.owner}
                onClick={() =>
                  action("select", { id: c.id, accountId: selected[c.id] })
                }
              >
                Confirm account
              </button>
            </div>
          )}
          {c.status === "CONNECTED" && (
            <div className="assistant-controls">
              <label>
                Sync from
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                Sync to
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <button
                className="btn secondary"
                disabled={busy || !from || !to || !report.owner}
                onClick={() => action("sync", { id: c.id, from, to })}
              >
                Sync / resume daily ads
              </button>
            </div>
          )}
          <button
            className="btn secondary"
            disabled={busy || !report.owner}
            onClick={() => {
              if (
                confirm(
                  "Disconnect locally and remove stored credentials? Revoke access at the provider separately.",
                )
              )
                void action("disconnect", { id: c.id });
            }}
          >
            Disconnect account
          </button>
        </section>
      ))}
      <h3>Sync history</h3>
      {!report?.runs.length && (
        <p>
          No sync history. Backfills use 1–31 closed days per window. Use
          consecutive windows for older data and re-sync recent days for
          corrections.
        </p>
      )}
      {report?.runs.map((r) => (
        <p key={r.id}>
          {r.fromDate} — {r.toDate} · {r.status} {r.errorCode}
        </p>
      ))}
      <h3>Latest daily facts</h3>
      <p>
        Latest 100 rows. Spend is displayed in the source currency (micro units
        are retained exactly).
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Campaign / ad set</th>
              <th>Spend</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>Timezone</th>
              <th>Provider conversions (not CRM bookings)</th>
            </tr>
          </thead>
          <tbody>
            {report?.facts.map((r, i) => (
              <tr key={r.connectionId + r.day + r.campaignId + r.adSetId + i}>
                <td>{r.day}</td>
                <td>
                  {r.campaignName}
                  <small>
                    {r.campaignId} · {r.adSetName} · {r.adSetId}
                  </small>
                </td>
                <td>
                  {r.currency} {BigInt(r.spendMicros) / 1000000n}.
                  {(BigInt(r.spendMicros) % 1000000n)
                    .toString()
                    .padStart(6, "0")}
                </td>
                <td>{r.impressions}</td>
                <td>{r.clicks}</td>
                <td>{r.timezone}</td>
                <td>
                  {r.providerConversions ?? "Data unavailable"}
                  <small>{r.conversionDefinition}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Razorpay is deferred. Manual Open in WhatsApp remains separate from the
        official Business API.
      </p>
    </section>
  );
}
