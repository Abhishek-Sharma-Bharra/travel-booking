"use client";
import type { AdminOverview } from "@/lib/admin-overview";
import { readSubscriptionRequest } from "@/lib/subscription-request-format";
import { useState } from "react";
import Link from "next/link";
import { indianDate } from "@/lib/money";
type Agency = {
  id: string;
  name: string;
  plan: string;
  subscription: string;
  trialEndsAt: string;
  subscriptionExpiresAt: string | null;
  _count: { users: number };
  activities: { id: string; action: string; createdAt: string }[];
};
export default function Admin({
  initial,
  summary,
}: {
  initial: Agency[];
  summary?: AdminOverview;
}) {
  const [agencies, setAgencies] = useState(initial),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="page-content admin-studio">
      <span className="eyebrow">VERIFIED SERVICE ADMINISTRATOR</span>
      <h1>Client subscriptions</h1>
      {summary && (
        <section className="panel" aria-label="Platform overview">
          <h2>Platform overview</h2>
          <p>
            Recorded snapshot · {indianDate(summary.asOf)}. Refresh after
            updates; active access is not proof of a collected subscription
            payment.
          </p>
          <div className="ops-metrics">
            {[
              ["Registered agencies", summary.agencies],
              ["Active CRM access", summary.activeAccess],
              ["Current trials", summary.trials],
              ["Registered hotels", summary.hotels],
            ].map(([label, value]) => (
              <article key={String(label)}>
                <small>{label}</small>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <h3>Launch configuration</h3>
          {summary.gaps.length ? (
            <ul>
              {summary.gaps.map((g) => (
                <li key={g}>{g} · needs review</li>
              ))}
            </ul>
          ) : (
            <p>
              Configuration checks complete. Real delivery, provider and
              recovery testing still need independent verification.
            </p>
          )}
          <p>
            Live AI gate:{" "}
            {summary.liveAI ? "enabled — verify pilot and budget" : "off"} ·
            SaaS test billing:{" "}
            {summary.testBilling ? "enabled (test only)" : "off"} · Live hotel
            payment gate:{" "}
            {summary.liveHotelPayments ? "enabled — verify merchant" : "off"}.
          </p>
          <p>
            MRR / ARR: unavailable until real contractual billing and verified
            payment records are connected. Proposed catalogue prices are not
            counted as revenue.
          </p>
          <a className="btn secondary" href="/admin/hotels">
            Hotel review
          </a>
          <a className="btn secondary" href="/admin/setup">
            Administrator security setup
          </a>
        </section>
      )}
      <Link className="btn primary" href="/admin/marketplace">
        Marketplace administration
      </Link>
      <p className="method-note">
        For Vashisht Analytics service operators only. Record agreed
        subscription access after arranging payment separately. This page never
        charges a customer. Showing the latest 200 agencies.
      </p>
      <Link href="/workspace" className="btn secondary">
        Back to workspace
      </Link>
      {message && (
        <p role="status" className="info-box">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="table-scroll panel">
        <table>
          <thead>
            <tr>
              <th>Agency</th>
              <th>Current access</th>
              <th>Update</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.name}</strong>
                  <small>
                    {a.id} · {a._count.users} total users
                  </small>
                </td>
                <td>
                  {a.plan} · {a.subscription}
                  <small>Trial ends {indianDate(a.trialEndsAt)}</small>
                  <small>
                    {a.subscriptionExpiresAt
                      ? `Paid access until ${indianDate(a.subscriptionExpiresAt)}`
                      : "No paid period set"}
                  </small>
                </td>
                <td>
                  {a.activities.length > 0 && (
                    <details>
                      <summary>
                        Recent subscription requests ({a.activities.length})
                      </summary>
                      {a.activities.map((r) => {
                        const v = readSubscriptionRequest(r.action);
                        return v ? (
                          <p key={r.id}>
                            {v.type} · {v.plan} · {indianDate(r.createdAt)}
                          </p>
                        ) : null;
                      })}
                      <p>
                        Verify agreed payment separately before activating
                        access. Cancellation requests require operator review.
                      </p>
                    </details>
                  )}
                  <form
                    className="row-actions"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (busy) return;
                      const f = new FormData(e.currentTarget);
                      const input = {
                        agencyId: a.id,
                        plan: String(f.get("plan")),
                        status: String(f.get("status")),
                        days: Number(f.get("days")),
                      };
                      setBusy(true);
                      setError("");
                      setMessage("");
                      try {
                        const r = await fetch("/api/admin/subscriptions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(input),
                          }),
                          body = await r.json();
                        if (!r.ok) throw new Error(body.error);
                        setMessage(body.message);
                        setAgencies(
                          agencies.map((x) =>
                            x.id === a.id
                              ? {
                                  ...x,
                                  plan: input.plan,
                                  subscription: input.status,
                                  subscriptionExpiresAt:
                                    input.status === "Active"
                                      ? new Date(
                                          Date.now() + input.days * 86400000,
                                        ).toISOString()
                                      : null,
                                }
                              : x,
                          ),
                        );
                      } catch (e) {
                        setError(
                          (e as Error).message ||
                            "Could not update subscription",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label>
                      Plan
                      <select name="plan" defaultValue={a.plan}>
                        <option>Starter</option>
                        <option>Growth</option>
                        <option>Professional</option>
                      </select>
                    </label>
                    <label>
                      Status
                      <select name="status" defaultValue={a.subscription}>
                        <option>Trial</option>
                        <option>Active</option>
                        <option>Paused</option>
                        <option>Cancelled</option>
                      </select>
                    </label>
                    <label>
                      Paid validity (days)
                      <input
                        name="days"
                        type="number"
                        required
                        min={1}
                        max={366}
                        defaultValue={30}
                      />
                    </label>
                    <button className="btn primary small" disabled={busy}>
                      Save access
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
