"use client";
import { useState } from "react";
import type { Dataset } from "@/lib/data";
import { indianDate } from "@/lib/money";
export default function SubscriptionPage({
  data,
  onRequest,
  error,
  busy,
}: {
  data: Dataset;
  onRequest: (input: Record<string, unknown>) => Promise<boolean>;
  error: string;
  busy: boolean;
}) {
  const [plan, setPlan] = useState(data.agency.plan),
    [type, setType] = useState("Start subscription"),
    [notice, setNotice] = useState("");
  const owner = data.actor.role === "OWNER",
    active = data.users.filter((u) => !u.disabled).length;
  const reserved = data.invitations.filter(
    (i) => i.status === "Pending" && new Date(i.expiresAt) > new Date(),
  ).length;
  const end =
    data.agency.subscription === "Trial"
      ? data.agency.trialEndsAt
      : data.agency.subscriptionExpiresAt;
  return (
    <section className="assistant-card feature-page subscription-page">
      <h2>Your subscription</h2>
      <div className="detail-grid">
        <div>
          <small>Current plan</small>
          <strong>{data.agency.plan}</strong>
        </div>
        <div>
          <small>Recorded status</small>
          <strong>{data.agency.subscription}</strong>
        </div>
        <div>
          <small>
            {data.agency.subscription === "Trial"
              ? "Trial ends"
              : "Paid access ends"}
          </small>
          <strong>{end ? indianDate(end) : "No expiry recorded"}</strong>
        </div>
        <div>
          <small>Business changes</small>
          <strong>
            {data.demo
              ? "Read-only demo"
              : data.access.canWrite
                ? "Enabled"
                : "Inactive — renewal required"}
          </strong>
        </div>
      </div>
      <p>
        Active team members: {active} / {data.access.limits.seats}.{" "}
        {owner
          ? `${reserved} unexpired invitations reserve seats.`
          : "The owner can review reserved invitation seats."}{" "}
        Enquiries stored: {data.billing.enquiryCount.toLocaleString("en-IN")} /{" "}
        {data.access.limits.leads.toLocaleString("en-IN")}. These are
        stored-record limits, not monthly quotas.
      </p>
      <h3>Available plans</h3>
      <div className="subscription-plans">
        {data.billing.plans.map((p) => (
          <section
            className="assistant-card plan-card"
            data-current={data.agency.plan === p.name}
            key={p.name}
          >
            <h3>
              {p.name}
              {data.agency.plan === p.name ? " · Current" : ""}
            </h3>
            <p>
              {p.seats} team seats · {p.leads.toLocaleString("en-IN")} stored
              enquiries
            </p>
            <p>Price on request</p>
            <small>
              Written quote confirms the monthly price, taxes, AI allowance,
              onboarding and support. No unlimited AI is included by default.
            </small>
          </section>
        ))}
      </div>
      <h3>Payment and renewal</h3>
      <p>
        Checkout and automatic billing are not connected. Request a plan below;
        the service administrator will arrange a written quote and payment
        instructions separately. Pay only through the verified business details
        on that quote. Your access is changed by an authorised administrator
        after verification, not by this form.
      </p>
      <p>
        Receipts recorded against travel bookings are not payments for your
        TravelOS subscription. No card, bank credential or payment screenshot is
        collected here.
      </p>
      {data.billing.supportEmail && (
        <p>
          Billing contact:{" "}
          <a href={`mailto:${data.billing.supportEmail}`}>
            {data.billing.supportEmail}
          </a>
        </p>
      )}
      {owner ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setNotice("");
            if (await onRequest({ plan, type }))
              setNotice(
                "Request recorded. No payment taken or automatic plan change.",
              );
          }}
        >
          <div className="assistant-controls">
            <label>
              Requested plan
              <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                {data.billing.plans.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
              </select>
            </label>
            <label>
              Request type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {[
                  "Start subscription",
                  "Renew",
                  "Upgrade",
                  "Cancel at period end",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <button className="btn primary" disabled={busy || data.demo}>
              {busy ? "Recording request…" : "Request subscription review"}
            </button>
          </div>
          <p>
            Cancellation requests do not cancel access automatically or confirm
            a refund. Await administrator confirmation. Requests are visible to
            the service administrator; no email notification is sent
            automatically.
          </p>
        </form>
      ) : (
        <p>Only the agency owner can request subscription changes.</p>
      )}
      {data.demo && (
        <p>
          Read-only demonstration. No subscription request or payment can be
          made.
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {owner && (
        <details open>
          <summary>Recent requests</summary>
          {data.billing.requests.length ? (
            data.billing.requests.map((r) => (
              <p key={r.id}>
                {r.type} · {r.plan} · {indianDate(r.createdAt)} · Request
                recorded; contact administrator for progress.
              </p>
            ))
          ) : (
            <p>No subscription requests recorded.</p>
          )}
        </details>
      )}
    </section>
  );
}
