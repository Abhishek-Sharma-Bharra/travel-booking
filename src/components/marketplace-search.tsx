"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { readApiJson } from "@/lib/api-response";
import { inr } from "@/lib/money";
import { command, Field, value, number, noticeError } from "./marketplace-ui";
import type { Selection } from "@/lib/marketplace/bookings";
interface Supplier {
  id: string;
  kind: string;
  name: string;
  city: string;
  hotelId: string | null;
}
interface Resource {
  id: string;
  businessId: string;
  name: string;
  capacity: number;
  pricing: string;
  ratePaise: number;
  minKm: number;
  taxBps: number;
  policies: string;
}
interface Quote {
  selection: Selection;
  supplier: string;
  subtotal: number;
  tax: number;
  total: number;
  quoteToken: string;
  policies: string;
  paymentTerms: string;
}
export default function MarketplaceSearch() {
  const [results, setResults] = useState<{
      businesses: Supplier[];
      vehicles: Resource[];
    } | null>(null),
    [selected, setSelected] = useState<Supplier | null>(null),
    [rooms, setRooms] = useState<{ id: string; name: string }[]>([]),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [booking, setBooking] = useState("");
  const requestKey = useRef("");
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(noticeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="market-section market-search">
      <div className="market-toolbar">
        <Link className="btn secondary" href="/operator">
          Your businesses & booking requests
        </Link>
        <Link className="btn secondary" href="/workspace">
          Agency CRM
        </Link>
      </div>
      <p className="method-note">
        Full vehicle charters only. Seat-level ticketing and paid AI/API
        connections are disabled.{" "}
        <Link href="/login?next=marketplace">Sign in</Link> with a verified
        account to request a quote.
      </p>
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
      <form
        className="panel market-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(async () => {
            setSelected(null);
            setQuote(null);
            setBooking("");
            const query = new URLSearchParams({
              kind: value(f, "kind"),
              city: value(f, "city"),
              ...(start && end ? { start, end } : {}),
            });
            setResults(
              await readApiJson(
                await fetch("/api/marketplace/public?" + query),
              ),
            );
          });
        }}
      >
        <label>
          Service
          <select name="kind">
            <option value="HOTEL">Hotels</option>
            <option value="BUS">Full bus charter</option>
            <option value="CAR">Car rental</option>
          </select>
        </label>
        <Field label="Destination / city" name="city" maxLength={80} />
        <Field
          label="Start / check-in"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
        <Field
          label="End / check-out (exclusive)"
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
        />
        <button className="btn primary" disabled={busy}>
          Search partners
        </button>
      </form>
      {results && (
        <div className="market-results">
          {!results.businesses.length && (
            <p className="panel">
              No approved partners match this search yet. Only verified,
              subscribed suppliers with accepted terms are listed.
            </p>
          )}
          {results.businesses.map((b) => (
            <article className="panel" key={b.id}>
              <span className="eyebrow">{b.kind}</span>
              <h2>{b.name}</h2>
              <p>{b.city}</p>
              {results.vehicles
                .filter((r) => r.businessId === b.id)
                .map((r) => (
                  <p key={r.id}>
                    {r.name} · up to {r.capacity} guests · {inr(r.ratePaise)}{" "}
                    {r.pricing === "TRIP" ? "per full trip" : "per km"}{" "}
                    {r.pricing === "KM" ? `(minimum ${r.minKm} km)` : ""}, plus
                    applicable tax.
                  </p>
                ))}
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setSelected(b);
                    setQuote(null);
                    setBooking("");
                    if (b.hotelId) {
                      const h = await readApiJson<{
                        rooms: { id: string; name: string }[];
                      }>(await fetch("/api/public/hotels/" + b.hotelId));
                      setRooms(h.rooms);
                    } else setRooms([]);
                  })
                }
              >
                Choose {b.kind === "HOTEL" ? "room" : "vehicle"}
              </button>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <section className="panel">
          <h2>Request with {selected.name}</h2>
          <form
            className="market-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const selection: Selection = {
                  businessId: selected.id,
                  ...(selected.kind === "HOTEL"
                    ? { roomId: value(f, "roomId") }
                    : { vehicleId: value(f, "vehicleId") }),
                  start,
                  end,
                  route: value(f, "route"),
                  capacity: number(f, "capacity"),
                  km: number(f, "km") || 1,
                  rooms: number(f, "rooms") || 1,
                  adults: number(f, "adults") || 2,
                  children: number(f, "children") || 0,
                  channel: value(f, "channel") as Selection["channel"],
                };
                const q = await command("quote", selection);
                setQuote(q as unknown as Quote);
                requestKey.current = crypto.randomUUID();
                setBooking("");
              });
            }}
          >
            {selected.kind === "HOTEL" ? (
              <label>
                Room category
                <select name="roomId" required>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Vehicle
                <select name="vehicleId" required>
                  {results?.vehicles
                    .filter((v) => v.businessId === selected.id)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.capacity} guests
                      </option>
                    ))}
                </select>
              </label>
            )}
            <Field
              label="Route / travel purpose"
              name="route"
              required
              minLength={3}
              maxLength={200}
            />
            <Field
              label="Group size"
              name="capacity"
              type="number"
              defaultValue="2"
              min={1}
              max={100}
              required
            />
            <Field
              label="Requested kilometers (charters)"
              name="km"
              type="number"
              min={1}
              max={10000}
              defaultValue="100"
            />
            {selected.kind === "HOTEL" && (
              <>
                <Field
                  label="Rooms"
                  name="rooms"
                  type="number"
                  defaultValue="1"
                  min={1}
                  max={10}
                />
                <Field
                  label="Adults"
                  name="adults"
                  type="number"
                  defaultValue="2"
                  min={1}
                  max={100}
                />
                <Field
                  label="Children"
                  name="children"
                  type="number"
                  defaultValue="0"
                  min={0}
                  max={100}
                />
              </>
            )}
            <label>
              Booking channel
              <select name="channel">
                <option value="MARKETPLACE">TravelOS marketplace</option>
                <option value="AGENCY">
                  Existing supplier–agency referral agreement
                </option>
                <option value="DIRECT">
                  My own direct business booking (supplier owner only)
                </option>
              </select>
            </label>
            <button className="btn primary" disabled={busy}>
              Get verified quote
            </button>
          </form>
        </section>
      )}
      {quote && (
        <section className="panel market-quote">
          <h2>Review your quote</h2>
          <p>
            {quote.supplier} · {quote.selection.start} → {quote.selection.end}
          </p>
          <dl>
            <div>
              <dt>Net amount</dt>
              <dd>{inr(quote.subtotal)}</dd>
            </div>
            <div>
              <dt>Taxes</dt>
              <dd>{inr(quote.tax)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{inr(quote.total)}</dd>
            </div>
          </dl>
          <p className="market-policy">{quote.policies}</p>
          <p>
            {quote.paymentTerms === "PAY_AT_SUPPLIER"
              ? "Pay the supplier directly. Confirmation does not mean payment has been received."
              : "Hotel confirmation requires the existing verified payment flow. A request or temporary hold is not a confirmed booking."}
          </p>
          <form
            className="market-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const r = await command("request", {
                  selection: quote.selection,
                  quoteToken: quote.quoteToken,
                  requestKey: requestKey.current,
                  customer: value(f, "customer"),
                  phone: value(f, "phone"),
                  email: value(f, "email"),
                  consent: f.has("consent"),
                });
                setBooking(String(r.bookingId));
                setNotice(
                  "Request saved: " +
                    r.bookingId +
                    ". The supplier must validate inventory before confirming.",
                );
              });
            }}
          >
            <Field
              label="Customer name"
              name="customer"
              required
              minLength={2}
            />
            <Field
              label="Customer phone with country code"
              name="phone"
              required
              placeholder="+919876543210"
            />
            <Field
              label="Customer email (optional)"
              name="email"
              type="email"
            />
            <label className="market-check">
              <input type="checkbox" name="consent" required /> I am authorized
              to share these guest details with this supplier, and accept the
              displayed price and policies.
            </label>
            <button className="btn primary" disabled={busy || !!booking}>
              {booking ? "Request saved" : "Send booking request"}
            </button>
          </form>
        </section>
      )}
    </section>
  );
}
