"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { inr, paise } from "@/lib/money";
import { readApiJson } from "@/lib/api-response";
import { Field, value, number, noticeError } from "./marketplace-ui";
import MarketplaceExport from "./marketplace-export";
import type { Plan, Business, Booking } from "@/lib/marketplace/types";
type Registered = Business & {
  subscriptionStatus: string;
  monthlyPaise: number;
  expiresAt: string;
  subscriptionRevision: number;
  agreementRevision: number;
  terms: string;
  commissionBps: number;
  platformBps: number;
  agencyBps: number;
  supplierBps: number;
  basis: string;
  acceptedAt: string | null;
};
interface Data {
  plans: Plan[];
  businesses: Registered[];
  bookings: (Booking & { kind: string; supplierName: string })[];
  metrics: {
    pendingSettlements: number;
    settlementCredits: number;
    hotelBookings: number;
    busBookings: number;
    carBookings: number;
    businesses: number;
    activeSubscriptions: number;
    mrr: number;
    commission: number;
    platform: number;
    agency: number;
    failedOrCancelled: number;
    hotelPaymentErrors: number;
    legacyAgencies: number;
    legacyHotels: number;
  };
  usage: {
    operations: number;
    requests: number;
    scope: string;
    infrastructureCost: string;
  };
  balances: { id: string; platformDue: number; agencyDue: number }[];
  audit: {
    id: string;
    action: string;
    createdAt: string;
    businessId: string;
  }[];
  scopeNote: string;
}
function config(f: FormData) {
  return {
    monthlyPaise: paise(value(f, "price")),
    requestLimit: number(f, "requests"),
    resourceLimit: number(f, "resources"),
    commissionBps: paise(value(f, "commission")),
    platformBps: paise(value(f, "platform")),
    agencyBps: paise(value(f, "agency")),
    supplierBps: paise(value(f, "supplier")),
    basis: value(f, "basis"),
  };
}
function PlanFields({ plan }: { plan: Plan }) {
  return (
    <>
      <Field
        label="Monthly price ₹"
        name="price"
        defaultValue={(plan.monthlyPaise / 100).toFixed(2)}
        required
        inputMode="decimal"
      />
      <Field
        label="Monthly request limit"
        name="requests"
        type="number"
        defaultValue={plan.requestLimit}
        min={1}
        max={100000}
      />
      <Field
        label="Vehicle/resource limit"
        name="resources"
        type="number"
        defaultValue={plan.resourceLimit}
        min={1}
        max={1000}
      />
      <Field
        label="Marketplace commission %"
        name="commission"
        defaultValue={plan.commissionBps / 100}
        required
      />
      <Field
        label="Platform share of commission %"
        name="platform"
        defaultValue={plan.platformBps / 100}
        required
      />
      <Field
        label="Agency share of commission %"
        name="agency"
        defaultValue={plan.agencyBps / 100}
        required
      />
      <Field
        label="Supplier share of commission %"
        name="supplier"
        defaultValue={plan.supplierBps / 100}
        required
      />
      <label>
        Eligible amount basis
        <select name="basis" defaultValue={plan.basis}>
          <option value="NET_TOTAL">Agreed net total (tax excluded)</option>
          <option value="NET_AFTER_DISCOUNT">
            Net after discount (tax excluded)
          </option>
        </select>
      </label>
    </>
  );
}
export default function MarketplaceAdmin({ initial }: { initial: unknown }) {
  const [data, setData] = useState(initial as Data),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const keys = useRef(new Map<string, string>());
  async function act(payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        ["settlement", "paymentRecord", "refundRecord", "cancel"].includes(
          String(payload.action),
        )
      ) {
        const fingerprint = JSON.stringify(payload);
        let key = keys.current.get(fingerprint);
        if (!key) {
          key = crypto.randomUUID();
          keys.current.set(fingerprint, key);
        }
        payload = { ...payload, eventKey: key };
      }
      const r = await readApiJson<{ message: string }>(
        await fetch("/api/admin/marketplace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setData(
        await readApiJson<Data>(
          await fetch("/api/admin/marketplace", { cache: "no-store" }),
        ),
      );
      setNotice(r.message);
    } catch (e) {
      setError(noticeError(e));
    } finally {
      setBusy(false);
    }
  }
  const pending = data.balances.reduce(
      (s, b) => s + Math.max(0, b.platformDue) + Math.max(0, b.agencyDue),
      0,
    ),
    credits = data.balances.reduce(
      (s, b) => s + Math.max(0, -b.platformDue) + Math.max(0, -b.agencyDue),
      0,
    );
  return (
    <main className="hotel-shell market-console">
      <header className="hotel-header">
        <div>
          <span className="eyebrow">VERIFIED PLATFORM ADMINISTRATOR</span>
          <h1>Marketplace overview</h1>
          <p>
            Subscriptions, business verification and commercial ledgers. All
            financial actions below are records of externally verified events.
          </p>
        </div>
        <Link className="btn secondary" href="/admin">
          Legacy agency subscriptions
        </Link>
        <Link className="btn secondary" href="/admin/hotels">
          Hotel verification
        </Link>
      </header>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="info-box" role="status">
          {notice}
        </p>
      )}
      <div className="market-kpis">
        {[
          ["Registered businesses", data.metrics.businesses],
          ["Active paid subscriptions", data.metrics.activeSubscriptions],
          ["Monthly recurring revenue", inr(data.metrics.mrr)],
          [
            "Commission earned, net of adjustments",
            inr(data.metrics.commission),
          ],
          ["Platform share earned", inr(data.metrics.platform)],
          ["Pending settlements", inr(data.metrics.pendingSettlements)],
          [
            "Credits due after adjustments",
            inr(data.metrics.settlementCredits),
          ],
          ["Expired/cancelled bookings", data.metrics.failedOrCancelled],
          ["Hotel payment errors", data.metrics.hotelPaymentErrors],
          ["Existing CRM agencies", data.metrics.legacyAgencies],
          ["Existing hotels", data.metrics.legacyHotels],
          ["Hotel booking requests", data.metrics.hotelBookings],
          ["Bus booking requests", data.metrics.busBookings],
          ["Car booking requests", data.metrics.carBookings],
        ].map(([label, v]) => (
          <article className="panel" key={String(label)}>
            <small>{label}</small>
            <strong>{v}</strong>
          </article>
        ))}
      </div>
      <p className="method-note">
        {data.scopeNote} MRR uses current active subscription snapshots; no cash
        receipt or automatic billing is implied.
      </p>
      <section className="panel">
        <h2>Infrastructure usage estimate</h2>
        <p>
          This month: {data.usage.operations} recorded marketplace operations;{" "}
          {data.usage.requests} requests.
        </p>
        <p>{data.usage.scope}</p>
        <p>{data.usage.infrastructureCost}</p>
      </section>
      <section className="panel">
        <h2>Subscription plans & default commission</h2>
        <p>
          Plan changes apply to future registrations/activations and future
          agreements. Accepted booking terms are never silently repriced.
        </p>
        {data.plans.map((p) => (
          <details key={p.id + ":" + p.revision}>
            <summary>
              {p.id} · {inr(p.monthlyPaise)}/month · {p.commissionBps / 100}%
              eligible marketplace commission
            </summary>
            <form
              className="market-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  void act({
                    action: "plan",
                    kind: p.id,
                    revision: p.revision,
                    config: config(new FormData(e.currentTarget)),
                  });
                } catch (e) {
                  setError(noticeError(e));
                }
              }}
            >
              <PlanFields plan={p} />
              <button className="btn primary" disabled={busy}>
                Save proposed plan
              </button>
            </form>
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>Business verification & subscriptions</h2>
        {data.businesses.map((b) => (
          <details
            key={
              b.id +
              ":" +
              b.revision +
              ":" +
              b.subscriptionRevision +
              ":" +
              b.agreementRevision
            }
          >
            <summary>
              {b.name} · {b.kind} · {b.status} · {b.subscriptionStatus}
            </summary>
            <p>
              {b.address} · {b.city}
              <br />
              {b.email} · {b.phone}
              <br />
              Business verification reference: {b.registration}
            </p>
            {["PENDING", "APPROVED"].includes(b.status) && (
              <form
                className="market-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act({
                    action: "review",
                    businessId: b.id,
                    revision: b.revision,
                    decision: value(f, "decision"),
                    reason: value(f, "reason"),
                    businessVerified: f.has("verified"),
                  });
                }}
              >
                <label>
                  Decision
                  <select name="decision">
                    {b.status === "PENDING" ? (
                      <>
                        <option value="APPROVED">Approve</option>
                        <option value="REJECTED">Reject</option>
                      </>
                    ) : (
                      <option value="SUSPENDED">Suspend</option>
                    )}
                  </select>
                </label>
                <Field
                  label="Review evidence / reason"
                  name="reason"
                  minLength={8}
                  required
                />
                <label className="market-check">
                  <input type="checkbox" name="verified" /> I independently
                  verified this business and owner.
                </label>
                <button className="btn secondary" disabled={busy}>
                  Record review
                </button>
              </form>
            )}
            <form
              className="market-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act({
                  action: "subscription",
                  businessId: b.id,
                  revision: b.subscriptionRevision,
                  status: value(f, "status"),
                  days: number(f, "days"),
                  reference: value(f, "reference"),
                });
              }}
            >
              <p>
                Current access until {b.expiresAt.slice(0, 10)}.{" "}
                {inr(b.monthlyPaise)}/month snapshot.
              </p>
              <label>
                Subscription access
                <select name="status" defaultValue="ACTIVE">
                  <option value="ACTIVE">
                    Active — external agreement verified
                  </option>
                  <option value="PAUSED">Paused</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </label>
              <Field
                label="Access days"
                name="days"
                type="number"
                min={1}
                max={366}
                defaultValue="30"
              />
              <Field
                label="External billing / agreement reference"
                name="reference"
                required
                minLength={8}
              />
              <button className="btn secondary" disabled={busy}>
                Record subscription access
              </button>
            </form>
            <details>
              <summary>
                Verify or revoke a supplier–agency referral relationship
              </summary>
              <form
                className="market-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act({
                    action: "referral",
                    businessId: b.id,
                    agencyId: value(f, "agencyId"),
                    status: value(f, "status"),
                    reference: value(f, "reference"),
                  });
                }}
              >
                <Field
                  label="Registered agency reference"
                  name="agencyId"
                  required
                />
                <label>
                  Referral relationship
                  <select name="status">
                    <option value="ACTIVE">
                      Verified active referral agreement
                    </option>
                    <option value="REVOKED">Revoked</option>
                  </select>
                </label>
                <Field
                  label="Verified supplier–agency contract reference"
                  name="reference"
                  required
                  minLength={8}
                />
                <button className="btn secondary" disabled={busy}>
                  Record referral agreement
                </button>
              </form>
            </details>
            <details>
              <summary>
                Revise commercial agreement (owner must accept again)
              </summary>
              <form
                className="market-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    void act({
                      action: "agreement",
                      businessId: b.id,
                      revision: b.agreementRevision,
                      terms: value(f, "terms"),
                      config: config(f),
                    });
                  } catch (e) {
                    setError(noticeError(e));
                  }
                }}
              >
                <label>
                  Written commercial terms
                  <textarea
                    name="terms"
                    defaultValue={b.terms}
                    required
                    minLength={40}
                    maxLength={4000}
                  />
                </label>
                <PlanFields
                  plan={{
                    ...data.plans.find((p) => p.id === b.kind)!,
                    ...b,
                    id: b.kind,
                    revision: 0,
                    basis: b.basis as Plan["basis"],
                  }}
                />
                <button className="btn secondary" disabled={busy}>
                  Offer revised agreement
                </button>
              </form>
            </details>
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>Hotel, bus and car booking monitoring</h2>
        {data.bookings.map((b) => (
          <details key={b.id + ":" + b.revision}>
            <summary>
              {b.supplierName} · {b.kind} · {b.status} · {inr(b.total)}
            </summary>
            <p>
              Booking {b.id} · {b.start} → {b.end}
              <br />
              {b.origin} · {b.paymentStatus}
              <br />
              {b.customer} · {b.phone}
            </p>
            {b.kind !== "HOTEL" &&
              b.paymentStatus === "UNPAID" &&
              ["CONFIRMED", "COMPLETED"].includes(b.status) && (
                <form
                  className="market-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act({
                      action: "paymentRecord",
                      bookingId: b.id,
                      revision: b.revision,
                      amount: b.total,
                      reference: value(f, "reference"),
                    });
                  }}
                >
                  <Field
                    label="Verified bank/provider receipt reference"
                    name="reference"
                    minLength={8}
                    required
                  />
                  <p>
                    Record the independently verified receipt of {inr(b.total)}.
                    This does not charge the customer.
                  </p>
                  <button className="btn secondary" disabled={busy}>
                    Record external payment verification
                  </button>
                </form>
              )}
            {["PROVIDER_VERIFIED", "EXTERNALLY_VERIFIED"].includes(
              b.paymentStatus,
            ) && (
              <form
                className="market-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    void act({
                      action: "refundRecord",
                      bookingId: b.id,
                      revision: b.revision,
                      refundedNet: paise(value(f, "net")),
                      refundedTax: paise(value(f, "tax")),
                      reference: value(f, "reference"),
                    });
                  } catch (e) {
                    setError(noticeError(e));
                  }
                }}
              >
                <Field
                  label="Cumulative externally refunded net ₹"
                  name="net"
                  required
                  defaultValue={b.refundedNet / 100}
                />
                <Field
                  label="Cumulative externally refunded taxes ₹"
                  name="tax"
                  required
                  defaultValue={b.refundedTax / 100}
                />
                <Field
                  label="Verified refund receipt reference"
                  name="reference"
                  minLength={8}
                  required
                />
                <button className="btn secondary" disabled={busy}>
                  Record verified refund & ledger adjustment
                </button>
              </form>
            )}
            {["REQUESTED", "HELD", "CONFIRMED", "EXPIRED"].includes(
              b.status,
            ) && (
              <form
                className="market-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act({
                    action: "cancel",
                    bookingId: b.id,
                    revision: b.revision,
                    reference: value(f, "reference"),
                    refundReviewed: f.has("reviewed"),
                  });
                }}
              >
                <Field
                  label="Cancellation / refund review reference"
                  name="reference"
                  minLength={8}
                  required
                />
                <label className="market-check">
                  <input name="reviewed" type="checkbox" required /> Payment
                  status and agreed refund obligations have been reviewed. No
                  refund is executed here.
                </label>
                <button className="btn secondary" disabled={busy}>
                  Record reviewed cancellation
                </button>
              </form>
            )}
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>External settlements</h2>
        <p>
          Record a verified external collection or return. No provider transfer
          or payment split is initiated.
        </p>
        {data.balances.map((b) => (
          <form
            className="market-form"
            key={b.id}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                booking = data.bookings.find((r) => r.id === b.id);
              if (!booking) {
                setError("Load the booking before recording a settlement");
                return;
              }
              try {
                void act({
                  action: "settlement",
                  bookingId: b.id,
                  revision: booking.revision,
                  party: value(f, "party"),
                  direction: value(f, "direction"),
                  amount: paise(value(f, "amount")),
                  reference: value(f, "reference"),
                });
              } catch (e) {
                setError(noticeError(e));
              }
            }}
          >
            <p>
              {b.id}
              <br />
              Platform balance {inr(b.platformDue)} · Agency balance{" "}
              {inr(b.agencyDue)}
            </p>
            <label>
              Party
              <select name="party">
                <option value="PLATFORM">Platform</option>
                <option value="AGENCY">Travel agency</option>
              </select>
            </label>
            <label>
              External movement
              <select name="direction">
                <option value="COLLECTED">Collected</option>
                <option value="RETURNED">Returned (credit balance)</option>
              </select>
            </label>
            <Field
              label="Verified settlement amount ₹"
              name="amount"
              required
            />
            <Field
              label="Verified external transfer reference"
              name="reference"
              minLength={8}
              required
            />
            <button className="btn secondary" disabled={busy}>
              Record settlement
            </button>
          </form>
        ))}
      </section>
      <MarketplaceExport admin />
      <section className="panel">
        <h2>Audit history</h2>
        {data.audit.map((a) => (
          <p key={a.id}>
            {a.createdAt} · {a.action} ·{" "}
            {a.businessId || "Platform configuration"}
          </p>
        ))}
      </section>
    </main>
  );
}
