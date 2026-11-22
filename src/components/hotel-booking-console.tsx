"use client";
import { useEffect, useState } from "react";
import type { HotelRoomCategory } from "@prisma/client";
import { readApiJson } from "@/lib/api-response";
import { inr } from "@/lib/money";
type Report = {
  inventory: Record<string, unknown>[];
  reservations: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  paymentEnabled: boolean;
  merchant: { mode: string; keySuffix: string; webhookPath: string } | null;
  payments: Record<string, unknown>[];
};
export default function HotelBookingConsole({
  hotelId,
  rooms,
  status,
  role,
}: {
  hotelId: string;
  rooms: Pick<HotelRoomCategory, "id" | "name" | "totalRooms">[];
  status: string;
  role: string;
}) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setReport(
        await readApiJson<Report>(
          await fetch(
            "/api/hotelier/booking?hotelId=" + encodeURIComponent(hotelId),
            { cache: "no-store" },
          ),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setReport(null);
    setError("");
    void load();
  }, [hotelId]);
  return (
    <section className="panel hotel-reservation-console">
      <h2 id="hotel-room-inventory">Room inventory &amp; guest requests</h2>
      <p>
        Rates are per room, per night in INR. Only explicitly configured dates
        can be booked. Keep these allotments synchronized with walk-in and
        other-channel bookings.
      </p>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {status === "APPROVED" ? (
        <p>
          Ad landing link:{" "}
          <a href={"/stays/" + hotelId} target="_blank" rel="noreferrer">
            Open your hotel booking page ↗
          </a>
          . Add <code>?utm_source=meta&amp;utm_campaign=summer</code> to track
          an ad campaign.
        </p>
      ) : (
        <p>
          Public listing requires independent platform approval. Configure your
          rooms and rates, then submit the property for verification.
        </p>
      )}
      <form
        className="hotel-inventory-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const raw = String(f.get("rate"));
            if (!/^\d+(\.\d{1,2})?$/.test(raw))
              throw Error(
                "Enter a valid INR rate with at most two decimal places",
              );
            const [whole, fraction = ""] = raw.split(".");
            const input = {
              roomId: f.get("roomId"),
              from: f.get("from"),
              to: f.get("to"),
              allotment: Number(f.get("allotment")),
              ratePaise: Number(whole) * 100 + Number(fraction.padEnd(2, "0")),
              minStay: Number(f.get("minStay")),
              closed: f.get("closed") === "on",
              confirmed: f.get("confirmed") === "on",
            };
            const result = await readApiJson<{ message: string }>(
              await fetch("/api/hotelier/booking", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hotelId, input }),
              }),
            );
            setNotice(result.message);
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Room category
          <select name="roomId" required>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.totalRooms} physical rooms
              </option>
            ))}
          </select>
        </label>
        <label>
          From date
          <input name="from" type="date" required />
        </label>
        <label>
          Until date (exclusive)
          <input name="to" type="date" required />
        </label>
        <label>
          Daily room allotment
          <input name="allotment" type="number" min="0" max="10000" required />
        </label>
        <label>
          Rate per room/night (₹)
          <input
            name="rate"
            inputMode="decimal"
            required
            placeholder="2500.00"
          />
        </label>
        <label>
          Minimum nights
          <input
            name="minStay"
            type="number"
            min="1"
            max="30"
            defaultValue="1"
            required
          />
        </label>
        <label>
          <input type="checkbox" name="closed" /> Blackout these dates
        </label>
        <label>
          <input type="checkbox" name="confirmed" required /> I confirm these
          rates and actual available allotments
        </label>
        <button
          className="btn primary"
          disabled={busy || !rooms.length || status === "SUSPENDED"}
        >
          Save inventory and rates
        </button>
      </form>
      <h3>Upcoming inventory</h3>
      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Room</th>
                <th>Allotment</th>
                <th>Rate</th>
                <th>Blackout</th>
              </tr>
            </thead>
            <tbody>
              {report?.inventory.map((n) => (
                <tr key={String(n.roomId) + String(n.day)}>
                  <td>{String(n.day)}</td>
                  <td>{rooms.find((r) => r.id === n.roomId)?.name}</td>
                  <td>{Number(n.allotment)}</td>
                  <td>{inr(Number(n.ratePaise))}</td>
                  <td>{n.closed ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <h3>Guest requests and temporary holds</h3>
      <p>
        A hold is not a confirmed booking. Captured test payments stay separate
        from real bookings. Live confirmation requires verified payment before
        hold expiry.
      </p>
      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Guest / contact</th>
                <th>Dates</th>
                <th>Rooms</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report?.reservations.map((r) => (
                <tr key={String(r.id)}>
                  <td>
                    {String(r.customer)}
                    <br />
                    {String(r.phone)}
                  </td>
                  <td>
                    {String(r.checkIn)} → {String(r.checkOut)}
                  </td>
                  <td>{Number(r.rooms)}</td>
                  <td>{inr(Number(r.total))}</td>
                  <td>
                    {r.status === "HELD" &&
                    String(r.holdUntil) < new Date().toISOString()
                      ? "EXPIRED"
                      : String(r.status)}{" "}
                    · {String(r.paymentStatus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <h3 id="hotel-ai-history">Guest conversations and handoffs</h3>
      {report?.conversations.map((c) => (
        <details key={String(c.id)}>
          <summary>
            {String(c.status)} ·{" "}
            {new Date(String(c.createdAt)).toLocaleString("en-IN")}
          </summary>
          {(
            JSON.parse(String(c.messages)) as {
              role: string;
              content: string;
            }[]
          ).map((m, i) => (
            <p key={i}>
              <strong>{m.role}: </strong>
              {m.content}
            </p>
          ))}
        </details>
      ))}
      <h3>Hotel payment account</h3>
      <p>
        {report?.merchant
          ? `${report.merchant.mode.toUpperCase()} merchant connected · key ending ${report.merchant.keySuffix}`
          : "Secure checkout is not configured for this hotel."}{" "}
        TravelOS booking commission: 0. Provider fees and subscription billing
        remain separate.
      </p>
      {report?.merchant && (
        <p>
          Webhook URL:{" "}
          <code>
            {typeof window !== "undefined" ? location.origin : ""}
            {report.merchant.webhookPath}
          </code>
          . Subscribe to payment.captured and payment.failed; backend verifies
          every capture with Razorpay.
        </p>
      )}
      {role === "OWNER" && (
        <form
          className="hotel-inventory-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const r = await readApiJson<{ message: string }>(
                await fetch("/api/hotelier/booking", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    hotelId,
                    action: "merchant",
                    input: {
                      keyId: f.get("keyId"),
                      keySecret: f.get("keySecret"),
                      webhookSecret: f.get("webhookSecret"),
                      authorized: f.get("authorized") === "on",
                    },
                  }),
                }),
              );
              setNotice(r.message);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Merchant key ID
            <input
              name="keyId"
              required
              placeholder="rzp_test_…"
              autoComplete="off"
            />
          </label>
          <label>
            Merchant key secret
            <input
              name="keySecret"
              type="password"
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            Webhook signing secret
            <input
              name="webhookSecret"
              type="password"
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            <input name="authorized" type="checkbox" required /> I am authorized
            to connect this hotel's own Razorpay account.
          </label>
          <button className="btn secondary" disabled={busy}>
            Encrypt and save merchant
          </button>
          <p>
            Use TEST credentials first. Live accounts require separate platform
            approval and a verified owner with recent MFA. Never share these
            secrets in chat.
          </p>
        </form>
      )}
      <h3>Payment reconciliation</h3>
      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Stay reference</th>
                <th>Order / payment</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report?.payments.map((p) => (
                <tr key={String(p.stayId)}>
                  <td>{String(p.stayId)}</td>
                  <td>
                    {String(p.orderId || "Order unknown")}
                    <br />
                    {String(p.paymentId || "")}
                  </td>
                  <td>{inr(Number(p.amount))}</td>
                  <td>
                    {String(p.status)}
                    {p.lastFailure ? " · " + String(p.lastFailure) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {role === "OWNER" && (
        <form
          className="hotel-inventory-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const r = await readApiJson<{ message: string }>(
                await fetch("/api/hotelier/booking", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    hotelId,
                    action: "reconcile",
                    input: {
                      stayId: f.get("stayId"),
                      orderId: f.get("orderId"),
                      confirmed: f.get("confirmed") === "on",
                    },
                  }),
                }),
              );
              setNotice(r.message);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Stay request ID
            <input name="stayId" required />
          </label>
          <label>
            Existing Razorpay order ID
            <input name="orderId" required />
          </label>
          <label>
            <input type="checkbox" name="confirmed" required /> Match this
            existing order; do not create another order.
          </label>
          <button className="btn secondary" disabled={busy}>
            Reconcile uncertain order
          </button>
        </form>
      )}
    </section>
  );
}
