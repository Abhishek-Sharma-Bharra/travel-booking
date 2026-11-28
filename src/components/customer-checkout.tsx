"use client";
import { useRef, useState } from "react";
type Checkout = new (options: Record<string, unknown>) => {
  open: () => void;
  on: (event: string, cb: () => void) => void;
};
let scriptPromise: Promise<void> | undefined;
function loadCheckout() {
  if ((window as unknown as { Razorpay?: Checkout }).Razorpay)
    return Promise.resolve();
  return (scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = undefined;
      reject(Error("Secure checkout could not load"));
    };
    document.head.append(s);
  }));
}
export default function CustomerCheckout({
  mode,
  onVerified,
}: {
  mode: string;
  onVerified: () => Promise<void>;
}) {
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    request = useRef<string | null>(null);
  async function call(action: string, input: unknown) {
    const r = await fetch("/api/customer/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input }),
      }),
      v = await r.json();
    if (!r.ok) throw Error(v.error);
    return v;
  }
  return (
    <section>
      <h3>
        {mode === "TEST"
          ? "Test checkout — no real collection"
          : "Pay your agency securely"}
      </h3>
      <p>
        Your agency's merchant account processes the payment. The server
        verifies capture before recording a real receipt. Booking status does
        not change from a browser callback.
      </p>
      {notice && <p role="status">{notice}</p>}
      <button
        className="btn primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await loadCheckout();
            request.current ??= crypto.randomUUID();
            const o = await call("CREATE", { requestId: request.current });
            if (o.state !== "READY" || !o.orderId)
              throw Error(
                "This checkout needs reconciliation. Contact your agency before retrying.",
              );
            const Razorpay = (window as unknown as { Razorpay: Checkout })
              .Razorpay;
            const checkout = new Razorpay({
              key: o.keyId,
              order_id: o.orderId,
              amount: o.amount,
              currency: o.currency,
              name: "Travel booking payment",
              handler: async (p: { razorpay_payment_id: string }) => {
                try {
                  const v = await call("VERIFY", {
                    paymentId: p.razorpay_payment_id,
                  });
                  setNotice(
                    v.state === "CAPTURED"
                      ? v.mode === "TEST"
                        ? "Test capture verified. No real receipt or booking change was made."
                        : "Capture verified by the backend. Your receipt was recorded."
                      : "Payment requires agency review; do not pay again.",
                  );
                  await onVerified();
                } catch (e) {
                  setNotice(
                    (e as Error).message +
                      " Do not pay again until your agency checks the record.",
                  );
                } finally {
                  setBusy(false);
                }
              },
              modal: {
                ondismiss: () => {
                  setBusy(false);
                  setNotice(
                    "Checkout closed. Contact your agency to check any payment before retrying.",
                  );
                },
              },
            });
            checkout.on("payment.failed", () => {
              setBusy(false);
              setNotice(
                "Payment was not confirmed. Check with your agency before starting another payment.",
              );
            });
            checkout.open();
          } catch (e) {
            setNotice((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Checking payment…"
          : mode === "TEST"
            ? "Open test checkout"
            : "Open secure checkout"}
      </button>
    </section>
  );
}
