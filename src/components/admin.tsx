"use client";
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
};
export default function Admin({ initial }: { initial: Agency[] }) {
  const [agencies, setAgencies] = useState(initial),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="page-content">
      <span className="eyebrow">VERIFIED SERVICE ADMINISTRATOR</span>
      <h1>Client subscriptions</h1>
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
