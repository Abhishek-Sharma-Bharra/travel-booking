"use client";
import { useEffect, useRef, useState } from "react";
import { readApiJson } from "@/lib/api-response";
import { inr, indianDate } from "@/lib/money";
import type {
  billingStatus,
  createTestCheckout,
} from "@/lib/saas-billing/service";
type Status = Awaited<ReturnType<typeof billingStatus>>;
type Checkout = Awaited<ReturnType<typeof createTestCheckout>>;
type RazorpayConstructor = new (options: Record<string, unknown>) => {
  open(): void;
};
let scriptPromise: Promise<void> | null = null;
function checkoutScript() {
  if ((window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay)
    return Promise.resolve();
  if (!scriptPromise)
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      const timer = window.setTimeout(() => {
        script.remove();
        scriptPromise = null;
        reject(
          Error(
            "Hosted test checkout could not load. No subscription request was sent.",
          ),
        );
      }, 20000);
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        scriptPromise = null;
        reject(
          Error(
            "Hosted test checkout is unavailable. No subscription request was sent.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return scriptPromise;
}
export default function SaasBillingSandbox() {
  const [status, setStatus] = useState<Status | null>(null),
    [code, setCode] = useState(""),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reconcileId, setReconcileId] = useState(""),
    [providerId, setProviderId] = useState("");
  const mounted = useRef(true),
    pending = useRef<{ hash: string; id: string } | null>(null),
    inFlight = useRef(false);
  async function refresh() {
    try {
      const v = await readApiJson<Status>(
        await fetch("/api/billing/sandbox", { cache: "no-store" }),
      );
      if (mounted.current) setStatus(v);
    } catch {
      if (mounted.current)
        setNotice(
          "Test billing status is unavailable. Existing manual subscriptions remain unchanged.",
        );
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, []);
  const selected = status?.plans.find((p) => p.code === code);
  useEffect(() => {
    setAccepted(false);
  }, [selected?.quoteHash]);
  async function start() {
    if (inFlight.current || !selected || !accepted) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    if (pending.current?.hash !== selected.quoteHash)
      pending.current = { hash: selected.quoteHash, id: crypto.randomUUID() };
    try {
      await checkoutScript();
      const Razorpay = (window as unknown as { Razorpay?: RazorpayConstructor })
        .Razorpay;
      if (!Razorpay)
        throw Error(
          "Hosted checkout did not initialise. No subscription request was sent.",
        );
      const c = await readApiJson<Checkout>(
        await fetch("/api/billing/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CREATE",
            input: {
              requestId: pending.current.id,
              planCode: selected.code,
              quoteHash: selected.quoteHash,
              acceptedTestTerms: true,
            },
          }),
        }),
      );
      if (!mounted.current) return;
      if (c.state !== "READY" || !c.subscriptionId || !c.keyId) {
        setNotice(
          "Review the recorded test checkout state before continuing. No production access changed.",
        );
        await refresh();
        return;
      }
      if (
        c.testMode !== true ||
        !/^rzp_test_[A-Za-z0-9]+$/.test(c.keyId) ||
        !/^sub_[A-Za-z0-9]+$/.test(c.subscriptionId) ||
        c.amountPaise !== selected.amountPaise ||
        c.currency !== "INR"
      )
        throw Error(
          "Unexpected test checkout response. Hosted checkout was not opened; review the recorded request.",
        );
      new Razorpay({
        key: c.keyId,
        subscription_id: c.subscriptionId,
        name: "VASHISHT TravelOS",
        description: "SANDBOX · " + selected.label,
        handler: () => {
          if (mounted.current) {
            setNotice(
              "Browser checkout returned. Waiting for independently verified test webhooks; production access remains unchanged.",
            );
            void refresh();
          }
        },
        modal: {
          ondismiss: () => {
            if (mounted.current) {
              setNotice(
                "Test checkout closed. Review billing history before reopening or starting another request.",
              );
              void refresh();
            }
          },
        },
      }).open();
      await refresh();
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        void refresh();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (inFlight.current || !reconcileId || !providerId) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await readApiJson(
        await fetch("/api/billing/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "RECONCILE",
            input: { checkoutId: reconcileId, subscriptionId: providerId },
          }),
        }),
      );
      if (mounted.current) {
        setNotice(
          "Provider test subscription binding reviewed. Payment/access still depends on verified test receipts; production access is unchanged.",
        );
        await refresh();
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (!status?.enabled) return null;
  return (
    <section
      className="assistant-card sandbox-billing"
      aria-label="Sandbox subscription billing"
    >
      <span className="eyebrow">TEST MODE ONLY</span>
      <h3>Subscription billing sandbox</h3>
      <p>
        {status.reason} Do not enter real payment details or treat test receipts
        as paid service access.
      </p>
      <label>
        Test plan
        <select
          value={code}
          disabled={busy}
          onChange={(e) => {
            setCode(e.target.value);
            setAccepted(false);
          }}
        >
          <option value="">Choose a test plan</option>
          {status.plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label} · {inr(p.amountPaise)} /{" "}
              {p.period === "monthly" ? "month" : "year"}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <p>
            <strong>{inr(selected.amountPaise)}</strong> · {selected.taxLabel} ·{" "}
            {selected.totalCycles} {selected.period} cycles
          </p>
          <p>{selected.cancellationTerms}</p>
          <p>Terms version: {selected.termsVersion}</p>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              disabled={busy}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I reviewed these test amounts and terms. This is a sandbox exercise,
            not a production subscription purchase.
          </label>
        </>
      )}
      <button
        className="btn primary"
        disabled={busy || !selected || !accepted}
        onClick={() => void start()}
      >
        {busy ? "Checking test billing…" : "Open test checkout"}
      </button>
      <button
        className="btn secondary"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh test billing history
      </button>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="info-box">
          {notice}
        </p>
      )}
      <h4>Recent test checkouts · up to 20</h4>
      {!status.checkouts.length && <p>No test checkout recorded.</p>}
      <ul>
        {status.checkouts.map((c) => (
          <li key={c.id}>
            {c.planCode} · {c.state} · {inr(c.amount)} ·{" "}
            {c.providerSubscriptionId || "Provider reference not confirmed"}
          </li>
        ))}
      </ul>
      {status.checkouts.some((c) =>
        ["UNKNOWN", "RESERVED"].includes(c.state),
      ) && (
        <details>
          <summary>Reconcile an unconfirmed test checkout</summary>
          <p>
            Find the original subscription in the Test Mode merchant dashboard.
            Do not create another subscription to guess whether the first one
            succeeded.
          </p>
          <label>
            Recorded checkout
            <select
              value={reconcileId}
              onChange={(e) => setReconcileId(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose unresolved checkout</option>
              {status.checkouts
                .filter((c) => ["UNKNOWN", "RESERVED"].includes(c.state))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Provider test subscription ID
            <input
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              maxLength={84}
              disabled={busy}
            />
          </label>
          <button
            className="btn secondary"
            disabled={busy || !reconcileId || !providerId}
            onClick={() => void reconcile()}
          >
            Verify original provider subscription
          </button>
        </details>
      )}
      <h4>Recent verified test receipts · up to 40</h4>
      {!status.receipts.length && (
        <p>No independently verified test receipt.</p>
      )}
      <ul>
        {status.receipts.map((r) => (
          <li key={r.id}>
            <strong>{inr(r.amount)}</strong> ·{" "}
            {r.refunded > 0 ? "REFUND REVIEW" : "VERIFIED TEST RECEIPT"} ·{" "}
            {indianDate(r.periodStart)} → {indianDate(r.periodEnd)} · recorded
            refunds {inr(r.refunded)}{" "}
            <a href={`/api/billing/sandbox/receipts/${r.id}`}>
              Download test receipt
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
