"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Dataset } from "@/lib/data";
import { balances, inr, indianDate } from "@/lib/money";
export default function BookingDocument({
  data,
  booking,
  onClose,
}: {
  data: Dataset;
  booking: Dataset["bookings"][number];
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab") return;
      const buttons =
        panel.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (!panel.current?.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [onClose]);
  const customer = data.leads.find((l) => l.id === booking.leadId),
    b = balances(booking),
    voucher =
      booking.status === "Confirmed" &&
      booking.supplierStatus === "Confirmed" &&
      b.customerDue === 0;
  return createPortal(
    <div
      className="ops-document-overlay"
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Booking travel document"
    >
      <div className="ops-document-actions">
        <button className="btn secondary" onClick={onClose}>
          Close document
        </button>
        <button className="btn primary" onClick={() => window.print()}>
          Print / save PDF
        </button>
      </div>
      <article className="ops-booking-print">
        <header>
          <strong>{data.agency.name}</strong>
          <p>Vashisht TravelOS · agency-issued travel record</p>
        </header>
        <h1>{voucher ? "Agency travel voucher" : "Booking summary"}</h1>
        <p>{booking.id}</p>
        <h2>{customer?.customer}</h2>
        <p>
          {customer?.phone} · {customer?.email}
        </p>
        <dl>
          <dt>Destination</dt>
          <dd>{booking.quote.destination}</dd>
          <dt>Package</dt>
          <dd>{booking.quote.packageName}</dd>
          <dt>Travel dates</dt>
          <dd>
            {indianDate(booking.travelStart)} – {indianDate(booking.travelEnd)}
          </dd>
          <dt>Travellers</dt>
          <dd>{booking.quote.travellers}</dd>
          <dt>Agency booking status</dt>
          <dd>{booking.status}</dd>
          <dt>Recorded supplier status</dt>
          <dd>{booking.supplierStatus}</dd>
          <dt>Recorded sales</dt>
          <dd>{inr(b.sales)}</dd>
          <dt>Manual net receipts</dt>
          <dd>{inr(b.netCash)}</dd>
          <dt>Recorded balance due</dt>
          <dd>{inr(b.customerDue)}</dd>
        </dl>
        <h3>Inclusions</h3>
        <p className="ops-preserve-lines">{booking.quote.inclusions}</p>
        <h3>Exclusions</h3>
        <p className="ops-preserve-lines">{booking.quote.exclusions}</p>
        <h3>Payment terms</h3>
        <p className="ops-preserve-lines">{booking.quote.paymentTerms}</p>
        <h3>Cancellation terms</h3>
        <p className="ops-preserve-lines">{booking.quote.cancellationTerms}</p>
        <footer>
          <p>
            {voucher
              ? "Issued from agency-recorded supplier confirmation and a zero recorded customer balance."
              : "This summary is not a supplier confirmation voucher. Review supplier status and outstanding balances with the agency."}{" "}
            Agency ledger entries are manual records; this document does not
            independently verify bank payment or external supplier inventory.
            Carry the supplier's own confirmation and required identity
            documents.
          </p>
          <small>
            Generated {new Date().toLocaleString("en-IN")} · Recheck booking
            changes with {data.agency.name}.
          </small>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
