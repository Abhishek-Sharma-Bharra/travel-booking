"use client";
import { useEffect, useState } from "react";
import { paise, inr } from "@/lib/money";
import CommerceDocumentView from "./commerce-document";
type Booking = {
  id: string;
  total: number;
  status: string;
  lead: { customer: string; email: string };
};
type Doc = {
  id: string;
  number: string;
  kind: string;
  snapshot: string;
  total: number;
  createdAt: string;
};
export default function CommerceWorkspace() {
  const [data, setData] = useState<{
      bookings: Booking[];
      documents: Doc[];
      payments?: { id: string; mode: string; state: string; amount: number }[];
    }>({
      bookings: [],
      documents: [],
    }),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Doc | null>(null),
    [preview, setPreview] = useState<any>(null),
    [bookingId, setBookingId] = useState(""),
    [kind, setKind] = useState("INVOICE"),
    [originalId, setOriginalId] = useState("");
  async function load() {
    try {
      const r = await fetch("/api/commerce", { cache: "no-store" }),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      setData(v);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(action: string, input: unknown) {
    const r = await fetch("/api/commerce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, input }),
    });
    const v = await r.json();
    if (!r.ok) throw Error(v.error);
    return v;
  }
  async function access(actionName: string) {
    if (!bookingId) return;
    setBusy(true);
    try {
      await action(actionName, { bookingId });
      setNotice(
        actionName === "INVITE"
          ? "A one-use invitation was sent to the booking email. It expires in 24 hours."
          : "All existing portal links and sessions for this booking are revoked.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice("");
    const f = new FormData(e.currentTarget),
      get = (k: string) => String(f.get(k) || "");
    try {
      const original = data.documents.find((d) => d.id === originalId),
        s = original ? JSON.parse(original.snapshot) : null;
      const supplier = s?.supplier || {
          name: get("supplierName"),
          gstin: get("supplierGstin"),
          address: get("supplierAddress"),
          stateCode: get("supplierState"),
        },
        recipient = s?.recipient || {
          name: get("recipientName"),
          gstin: get("recipientGstin"),
          address: get("recipientAddress"),
          stateCode: get("recipientState"),
        };
      setBusy(true);
      const v = await action("PREVIEW", {
        requestId: crypto.randomUUID(),
        bookingId,
        kind,
        ...(kind === "CREDIT_NOTE" ? { originalId } : {}),
        supplier,
        recipient,
        placeOfSupply: s?.placeOfSupply || get("placeOfSupply"),
        lines: [
          {
            description: get("description"),
            sac: get("sac"),
            taxablePaise: paise(get("taxable")),
            gstBps: Number(get("gstBps")),
          },
        ],
        reason: get("reason"),
        taxBasis: get("taxBasis"),
        reviewed: true,
      });
      setPreview(v);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content commerce-workspace">
      <a href="/workspace">← Agency workspace</a>
      <h1>Accounts & customer portal</h1>
      <p>
        <a href="/workspace/communications">Official WhatsApp delivery →</a>
      </p>
      <p>
        Issue reviewed GST documents and give a customer private access to their
        own booking. Tax documents do not change collections or confirm
        inventory.
      </p>
      {notice && (
        <p role="status" className="info-box">
          {notice}
        </p>
      )}
      <section className="panel">
        <h2>Choose a booking</h2>
        <select
          aria-label="Booking"
          value={bookingId}
          onChange={(e) => {
            setBookingId(e.target.value);
            setPreview(null);
          }}
        >
          <option value="">Select booking</option>
          {data.bookings.map((b) => (
            <option value={b.id} key={b.id}>
              {b.lead.customer} · {inr(b.total)} · {b.status}
            </option>
          ))}
        </select>
        <p>
          {data.bookings.find((b) => b.id === bookingId)?.lead.email ||
            "Maintain the customer's email in Enquiries before sending an invitation."}
        </p>
        <button
          className="btn primary"
          disabled={busy || !bookingId}
          onClick={() => access("INVITE")}
        >
          Email customer portal invitation
        </button>{" "}
        <button
          className="btn secondary"
          disabled={busy || !bookingId}
          onClick={() => access("REVOKE")}
        >
          Revoke customer access
        </button>
      </section>
      <form
        className="panel"
        onSubmit={prepare}
        onChange={() => setPreview(null)}
      >
        <h2>Prepare tax document</h2>
        <p>
          Use your accountant-approved SAC, taxable value and tax treatment. The
          system does not decide whether tour-operator concessions, margins or
          special rules apply.
        </p>
        <label>
          Document type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="INVOICE">Tax invoice</option>
            <option value="CREDIT_NOTE">Credit note</option>
          </select>
        </label>
        {kind === "CREDIT_NOTE" ? (
          <label>
            Original invoice
            <select
              required
              value={originalId}
              onChange={(e) => setOriginalId(e.target.value)}
            >
              <option value="">Select original invoice</option>
              {data.documents
                .filter(
                  (d) =>
                    d.kind === "INVOICE" &&
                    JSON.parse(d.snapshot).bookingId === bookingId,
                )
                .map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.number}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <div className="commerce-parties">
            {["supplier", "recipient"].map((p) => (
              <fieldset key={p}>
                <legend>
                  {p === "supplier"
                    ? "Your registered business"
                    : "Customer billing details"}
                </legend>
                <label>
                  Legal name
                  <input name={p + "Name"} required maxLength={160} />
                </label>
                <label>
                  Address
                  <textarea
                    name={p + "Address"}
                    required
                    minLength={8}
                    maxLength={500}
                  />
                </label>
                <label>
                  GSTIN {p === "recipient" && "(optional)"}
                  <input
                    name={p + "Gstin"}
                    required={p === "supplier"}
                    maxLength={15}
                  />
                </label>
                <label>
                  State code (01–38)
                  <input
                    name={p + "State"}
                    required
                    pattern="[0-3][0-9]"
                    maxLength={2}
                  />
                </label>
              </fieldset>
            ))}
          </div>
        )}
        {kind === "INVOICE" && (
          <label>
            Place of supply — state code
            <input
              name="placeOfSupply"
              required
              pattern="[0-3][0-9]"
              maxLength={2}
            />
          </label>
        )}
        <div className="commerce-parties">
          <label>
            Service description
            <input name="description" required minLength={3} maxLength={240} />
          </label>
          <label>
            SAC (6 digits)
            <input name="sac" required pattern="[0-9]{6}" maxLength={6} />
          </label>
          <label>
            Eligible taxable amount (₹)
            <input
              name="taxable"
              required
              inputMode="decimal"
              placeholder="Amount before GST"
            />
          </label>
          <label>
            Reviewed GST rate
            <select name="gstBps" required defaultValue="">
              <option value="">Choose reviewed rate</option>
              {[0, 5, 12, 18, 28].map((n) => (
                <option value={n * 100} key={n}>
                  {n}%
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Tax basis / treatment
          <textarea name="taxBasis" required minLength={10} maxLength={700} />
        </label>
        <label>
          Document purpose / credit-note reason
          <textarea name="reason" required minLength={5} maxLength={500} />
        </label>
        <label>
          <input type="checkbox" required /> I reviewed the supply details, GST
          treatment and document amount.
        </label>
        <button className="btn secondary" disabled={busy || !bookingId}>
          Preview document
        </button>
      </form>
      {preview && (
        <section className="panel">
          <h2>Review before issue</h2>
          <p>
            Taxable: {inr(preview.taxable)} · CGST: {inr(preview.cgst)} · SGST:{" "}
            {inr(preview.sgst)} · IGST: {inr(preview.igst)}
          </p>
          <h3>Total: {inr(preview.total)}</h3>
          <p>
            Issued documents cannot be edited or deleted. Corrections require a
            linked credit note.
          </p>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const d = await action("ISSUE", preview.input);
                setSelected(d);
                setPreview(null);
                setNotice(
                  "Issued document saved. No payment or refund was initiated.",
                );
                await load();
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Issue immutable document
          </button>
        </section>
      )}
      <section className="panel">
        <h2>Payment reconciliation</h2>
        <p>
          No live charges are enabled until your own merchant setup is approved.
          Captured late payments and ambiguous receipts require review; no
          automatic refunds are initiated.
        </p>
        {data.payments?.map((p: any) => (
          <div key={p.id}>
            <p>
              {p.mode} · {p.state} · {inr(p.amount)} · {p.id}
            </p>
            {["UNKNOWN", "CREATING", "READY"].includes(p.state) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const orderId = String(
                    new FormData(e.currentTarget).get("orderId"),
                  );
                  setBusy(true);
                  void action("RECONCILE_ORDER", { id: p.id, orderId })
                    .then(() => {
                      setNotice(
                        "Provider order verified. Customer can resume this checkout.",
                      );
                      return load();
                    })
                    .catch((e) => setNotice(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                <label>
                  Order reference from your merchant dashboard
                  <input name="orderId" required pattern="order_[A-Za-z0-9]+" />
                </label>
                <button className="btn secondary" disabled={busy}>
                  Verify provider order
                </button>
              </form>
            )}
          </div>
        ))}
        <h2>Issued documents</h2>
        {!data.documents.length && <p>No documents issued yet.</p>}
        {data.documents.map((d) => (
          <p key={d.id}>
            <button className="text-button" onClick={() => setSelected(d)}>
              {d.number}
            </button>{" "}
            · {d.kind} · {inr(d.total)}
          </p>
        ))}
      </section>
      {selected && (
        <CommerceDocumentView
          document={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
