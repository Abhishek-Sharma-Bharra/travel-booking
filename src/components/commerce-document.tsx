"use client";
import { inr } from "@/lib/money";
export default function CommerceDocumentView({
  document: d,
  onClose,
}: {
  document: { number: string; kind: string; snapshot: string; total: number };
  onClose: () => void;
}) {
  const s = JSON.parse(d.snapshot);
  return (
    <section className="panel commerce-print" aria-label="Issued tax document">
      <div className="commerce-no-print">
        <button className="btn secondary" onClick={onClose}>
          Close document
        </button>{" "}
        <button className="btn primary" onClick={() => window.print()}>
          Print / save PDF
        </button>
      </div>
      <h1>
        {d.kind === "CREDIT_NOTE" ? "GST credit note" : "GST tax invoice"}
      </h1>
      <p>
        <strong>{d.number}</strong> · {s.issueDate} · INR
      </p>
      <div className="commerce-parties">
        <section>
          <h2>Supplier</h2>
          <strong>{s.supplier.name}</strong>
          <p>{s.supplier.address}</p>
          <p>
            GSTIN: {s.supplier.gstin} · State: {s.supplier.stateCode}
          </p>
        </section>
        <section>
          <h2>Bill to</h2>
          <strong>{s.recipient.name}</strong>
          <p>{s.recipient.address}</p>
          <p>
            GSTIN: {s.recipient.gstin || "Unregistered"} · State:{" "}
            {s.recipient.stateCode}
          </p>
        </section>
      </div>
      <p>
        Place of supply: {s.placeOfSupply} · Booking: {s.bookingReference}
      </p>
      {s.originalId && (
        <p>Original invoice reference: {s.originalNumber || s.originalId}</p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Service / SAC</th>
              <th>Taxable value</th>
              <th>GST</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>IGST</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l: any, i: number) => (
              <tr key={i}>
                <td>
                  {l.description}
                  <br />
                  {l.sac}
                </td>
                <td>{inr(l.taxablePaise)}</td>
                <td>{l.gstBps / 100}%</td>
                <td>{inr(l.cgst)}</td>
                <td>{inr(l.sgst)}</td>
                <td>{inr(l.igst)}</td>
                <td>{inr(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Total: {inr(d.total)}</h2>
      <p>Tax basis reviewed by issuer: {s.taxBasis}</p>
      <p>{s.reason}</p>
      <p>
        This document records tax amounts declared by the issuing business. It
        is not proof of payment, inventory confirmation or government
        e-invoice/IRN submission. A credit note does not automatically issue a
        refund.
      </p>
    </section>
  );
}
