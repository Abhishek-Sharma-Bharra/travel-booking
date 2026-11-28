"use client";
import { useEffect, useState } from "react";
import { inr } from "@/lib/money";
import CustomerCheckout from "./customer-checkout";
import CommerceDocumentView from "./commerce-document";
export default function CustomerPortal() {
  const [invite, setInvite] = useState(""),
    [data, setData] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<any>(null);
  async function load() {
    const r = await fetch("/api/customer", { cache: "no-store" }),
      v = await r.json();
    if (!r.ok) {
      setNotice(v.error);
      return;
    }
    setData(v);
    setNotice("");
  }
  useEffect(() => {
    function readInvitation() {
      const token = new URLSearchParams(location.hash.slice(1)).get("invite");
      if (token) {
        setInvite(token);
        setData(null);
        setNotice("");
        history.replaceState(null, "", "/customer");
      } else void load();
    }
    readInvitation();
    window.addEventListener("hashchange", readInvitation);
    return () => window.removeEventListener("hashchange", readInvitation);
  }, []);
  return (
    <main className="page-content commerce-workspace">
      <a href="/">VASHISHT TRAVELOS</a>
      <h1>Your private travel portal</h1>
      <p>
        Access is limited to the booking in your agency invitation. Keep
        invitation links private.
      </p>
      {notice && (
        <p className="info-box" role="status">
          {notice}
        </p>
      )}
      {invite && (
        <section className="panel">
          <h2>Open your booking</h2>
          <p>
            This one-use invitation will be exchanged for a private 24-hour
            session.
          </p>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch("/api/customer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: invite }),
                  }),
                  v = await r.json();
                if (!r.ok) throw Error(v.error);
                setInvite("");
                await load();
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Continue to my booking
          </button>
        </section>
      )}
      {data && (
        <>
          <section className="panel">
            <h2>{data.agency.name}</h2>
            <h3>{data.booking.packageName}</h3>
            <p>
              {data.booking.customer} · {data.booking.destination}
            </p>
            <p>
              Booking status: <strong>{data.booking.status}</strong>
            </p>
            <p>
              {new Date(data.booking.travelStart).toLocaleDateString("en-IN")} –{" "}
              {new Date(data.booking.travelEnd).toLocaleDateString("en-IN")}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{data.booking.itinerary}</p>
            <h3>Payment records</h3>
            <p>
              Total {inr(data.booking.total)} · Recorded receipts{" "}
              {inr(data.booking.recordedReceipts)} · Recorded refunds{" "}
              {inr(data.booking.recordedRefunds)} · Outstanding{" "}
              {inr(data.booking.outstanding)}
            </p>
            <p>
              Recorded agency receipts are not an independent gateway payment
              verification.
            </p>
            {data.paymentMode ? (
              <CustomerCheckout mode={data.paymentMode} onVerified={load} />
            ) : (
              <p>
                Online checkout is not configured for this agency. Contact your
                agency for payment options.
              </p>
            )}
            <h3>Payment terms</h3>
            <p>{data.booking.paymentTerms || "Contact your agency."}</p>
            <h3>Cancellation terms</h3>
            <p>{data.booking.cancellationTerms || "Contact your agency."}</p>
            <button
              className="btn secondary"
              onClick={async () => {
                await fetch("/api/customer", { method: "DELETE" });
                setData(null);
                setNotice(
                  "Signed out. Request a fresh invitation to sign in again.",
                );
              }}
            >
              Sign out
            </button>
          </section>
          <section className="panel">
            <h2>Your documents</h2>
            {!data.documents.length && (
              <p>Your agency has not issued documents yet.</p>
            )}
            {data.documents.map((d: any) => (
              <p key={d.id}>
                <button className="text-button" onClick={() => setSelected(d)}>
                  {d.number}
                </button>{" "}
                · {inr(d.total)}
              </p>
            ))}
          </section>
        </>
      )}
      {selected && (
        <CommerceDocumentView
          document={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
