"use client";
import TransportOperations from "./transport-operations";
import MarketplaceCalendar from "./marketplace-calendar";
import { useState, useEffect } from "react";
import Link from "next/link";
import { inr, paise } from "@/lib/money";
import { readApiJson } from "@/lib/api-response";
import { command, Field, value, number, noticeError } from "./marketplace-ui";
import type {
  Business,
  Vehicle,
  Agreement,
  Subscription,
  Booking,
  Plan,
} from "@/lib/marketplace/types";
import MarketplaceExport from "./marketplace-export";
type Driver = { id: string; name: string };
type Owned = Business & {
  vehicles: Vehicle[];
  drivers: Driver[];
  blackouts: {
    id: string;
    vehicleId: string;
    start: string;
    end: string;
    reason: string;
  }[];
  subscription: Subscription;
  agreement: Agreement;
  metrics?: {
    bookings: number;
    bookedRevenue: number;
    verifiedCollections: number;
    expenses: number;
  };
  occupancy?: { availableRoomNights: number; bookedRoomNights: number };
};
interface Data {
  operationsEnabled?: boolean;
  businesses: Owned[];
  availableHotels: { id: string; name: string; status: string }[];
  bookings: Booking[];
  ledger: {
    id: string;
    bookingId: string;
    kind: string;
    commission: number;
    platform: number;
    agency: number;
    createdAt: string;
  }[];
  plans: Plan[];
  emailVerified: boolean;
  agencyReference: string | null;
  limitsNote: string;
}
export default function MarketplaceConsole({
  initial,
  preferredKind,
}: {
  initial: unknown;
  preferredKind?: "BUS" | "CAR" | "HOTEL";
}) {
  const [data, setData] = useState(initial as Data),
    [selected, setSelected] = useState(
      (initial as Data).businesses.find(
        (b) => !preferredKind || b.kind === preferredKind,
      )?.id || "",
    ),
    [creating, setCreating] = useState(
      !(initial as Data).businesses.some(
        (b) => !preferredKind || b.kind === preferredKind,
      ),
    ),
    [kind, setKind] = useState<string>(preferredKind || "BUS"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const b = data.businesses.find((b) => b.id === selected);
  async function run(action: string, payload: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await command(action, payload);
      const fresh = await readApiJson<Data>(
        await fetch("/api/marketplace", { cache: "no-store" }),
      );
      setData(fresh);
      if (result.businessId) {
        setSelected(String(result.businessId));
        setCreating(false);
      }
      setNotice(String(result.message || "Saved. No payment was collected."));
    } catch (e) {
      setError(noticeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="hotel-shell hotel-branded market-console">
      <header className="hotel-brand-nav">
        <Link className="brand" href="/">
          VASHISHT <small>TRAVELOS</small>
        </Link>
        <span>Business marketplace workspace</span>
        <Link className="btn secondary" href="/marketplace">
          Find a travel partner
        </Link>
        <Link className="btn secondary" href="/workspace">
          Agency CRM
        </Link>
      </header>
      <header className="hotel-header">
        <div>
          <span className="eyebrow">YOUR BUSINESS, CONNECTED</span>
          <h1>Businesses & booking requests</h1>
          <p>
            Manage full vehicle charters, commercial terms and supplier
            requests.
          </p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          Register a business
        </button>
      </header>
      {!data.emailVerified && (
        <p className="info-box">
          Save a private business draft now. Verify your email from sign in
          before submitting or requesting bookings.
        </p>
      )}
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
      <nav className="market-toolbar" aria-label="Your registered businesses">
        {data.businesses.map((b) => (
          <button
            className="btn secondary"
            key={b.id}
            onClick={() => {
              setSelected(b.id);
              setCreating(false);
            }}
          >
            {b.name} · {b.kind}
          </button>
        ))}
        <Link href="/hotelier" className="btn secondary">
          Hotel inventory & guests
        </Link>
      </nav>
      {creating && (
        <section className="panel">
          <h2>Register your business</h2>
          <form
            className="market-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run("register", {
                kind: value(f, "kind"),
                profile: {
                  name: value(f, "name"),
                  city: value(f, "city"),
                  address: value(f, "address"),
                  phone: value(f, "phone"),
                  email: value(f, "email"),
                  registration: value(f, "registration"),
                  paymentInstructions: value(f, "paymentInstructions"),
                },
                ...(kind === "HOTEL" ? { hotelId: value(f, "hotelId") } : {}),
              });
            }}
          >
            <label>
              Business type
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="BUS">Bus operator</option>
                <option value="CAR">Car rental</option>
                <option value="HOTEL">Hotel marketplace listing</option>
                <option value="AGENCY">Travel agency marketplace access</option>
              </select>
            </label>
            <Field label="Business name" name="name" required minLength={2} />
            <Field label="City" name="city" required minLength={2} />
            <Field
              label="Business address"
              name="address"
              required
              minLength={10}
            />
            <Field
              label="Business phone with country code"
              name="phone"
              required
            />
            <Field label="Business email" name="email" type="email" required />
            <Field
              label="Business registration / verification reference"
              name="registration"
              required
              minLength={3}
            />
            <Field
              label="Customer payment instructions (never enter secret keys or card details)"
              name="paymentInstructions"
              defaultValue="Pay the supplier directly under the agreed booking terms."
              maxLength={300}
            />
            {kind === "HOTEL" && (
              <div>
                <p>
                  Complete registration and approval in your hotel dashboard,
                  then link the property you own.
                </p>
                <Link href="/hotelier">Open hotel dashboard</Link>
                <label>
                  Your registered property
                  <select
                    name="hotelId"
                    aria-label="Your registered property"
                    required
                  >
                    <option value="">Choose your property</option>
                    {data.availableHotels.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} · {h.status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p className="method-note">
              A free 14-day trial starts with registration. Public listing
              requires independent business approval and accepted terms. No
              subscription payment is taken.
            </p>
            <button className="btn primary" disabled={busy}>
              Save business draft
            </button>
          </form>
        </section>
      )}
      {data.operationsEnabled &&
        b &&
        !creating &&
        ["BUS", "CAR"].includes(b.kind) && (
          <TransportOperations key={b.id} businessId={b.id} />
        )}
      {b && !creating && (
        <>
          <section className="panel">
            <div className="hotel-section-header">
              <div>
                <h2>{b.name}</h2>
                <p>
                  {b.kind} · {b.status} · {b.city}
                </p>
                <p>{b.reviewReason}</p>
              </div>
              {["DRAFT", "REJECTED"].includes(b.status) && (
                <button
                  className="btn primary"
                  disabled={busy || !data.emailVerified}
                  onClick={() =>
                    void run("business", {
                      action: "submit",
                      businessId: b.id,
                      revision: b.revision,
                    })
                  }
                >
                  Submit business for verification
                </button>
              )}
            </div>
            <details key={b.id + ":" + b.revision}>
              <summary>Edit business profile (requires fresh review)</summary>
              <form
                className="market-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run("business", {
                    action: "profile",
                    businessId: b.id,
                    revision: b.revision,
                    profile: {
                      name: value(f, "name"),
                      city: value(f, "city"),
                      address: value(f, "address"),
                      phone: value(f, "phone"),
                      email: value(f, "email"),
                      registration: value(f, "registration"),
                      paymentInstructions: value(f, "paymentInstructions"),
                    },
                  });
                }}
              >
                {(
                  [
                    ["name", "Business display name"],
                    ["city", "Business city"],
                    ["address", "Business street address"],
                    ["phone", "Business contact phone"],
                    ["email", "Business contact email"],
                    ["registration", "Business evidence reference"],
                    ["paymentInstructions", "Customer payment instructions"],
                  ] as const
                ).map(([name, label]) => (
                  <Field
                    key={name}
                    name={name}
                    label={label}
                    defaultValue={String(b[name])}
                    required
                  />
                ))}
                <button className="btn secondary" disabled={busy}>
                  Save profile for review
                </button>
              </form>
            </details>
            <div className="market-kpis">
              <article>
                <small>Confirmed booking value</small>
                <strong>{inr(b.metrics?.bookedRevenue || 0)}</strong>
              </article>
              <article>
                <small>Verified collections</small>
                <strong>{inr(b.metrics?.verifiedCollections || 0)}</strong>
              </article>
              <article>
                <small>Recorded expenses</small>
                <strong>{inr(b.metrics?.expenses || 0)}</strong>
              </article>
              <article>
                <small>Booking requests</small>
                <strong>{b.metrics?.bookings || 0}</strong>
              </article>
            </div>
            <p className="method-note">
              Booking value and verified collections include taxes. Net amounts,
              taxes and refunds are separate in downloaded reports.
            </p>
            {b.occupancy && (
              <p>
                Last 30 days occupancy:{" "}
                {b.occupancy.availableRoomNights
                  ? Math.round(
                      (b.occupancy.bookedRoomNights /
                        b.occupancy.availableRoomNights) *
                        100,
                    ) + "%"
                  : "Not enough configured inventory"}{" "}
                · {b.occupancy.bookedRoomNights} booked /{" "}
                {b.occupancy.availableRoomNights} configured room-nights. Other
                channels are not synchronized.
              </p>
            )}
            <p>
              Subscription: {b.subscription.status} ·{" "}
              {inr(b.subscription.monthlyPaise)}/month · access until{" "}
              {b.subscription.expiresAt.slice(0, 10)}. Activation is arranged
              with the platform.
            </p>
            <p>
              Plan limits:{" "}
              {data.plans.find((p) => p.id === b.kind)?.resourceLimit}{" "}
              vehicles/resources;{" "}
              {data.plans.find((p) => p.id === b.kind)?.requestLimit} booking
              requests per calendar month.
            </p>
          </section>
          <section className="panel">
            <h2>Commercial agreement</h2>
            <p className="market-policy">{b.agreement.terms}</p>
            <p>
              Marketplace commission {b.agreement.commissionBps / 100}% · split:
              platform {b.agreement.platformBps / 100}%, agency{" "}
              {b.agreement.agencyBps / 100}%, supplier{" "}
              {b.agreement.supplierBps / 100}% of the commission. Basis:{" "}
              {b.agreement.basis === "NET_TOTAL"
                ? "agreed net total"
                : "net after discount"}
              , excluding taxes and documented refunded net.
            </p>
            <p>
              Direct bookings and agency referrals: no marketplace commission.
            </p>
            {b.agreement.acceptedAt ? (
              <p>
                Accepted on {b.agreement.acceptedAt.slice(0, 10)}. Changing
                terms requires fresh acceptance; old booking snapshots are
                preserved.
              </p>
            ) : (
              <button
                className="btn primary"
                disabled={busy || !data.emailVerified}
                onClick={() =>
                  void run("business", {
                    action: "acceptAgreement",
                    businessId: b.id,
                    revision: b.agreement.revision,
                    accepted: true,
                  })
                }
              >
                Accept the displayed commercial agreement
              </button>
            )}
          </section>
          {["BUS", "CAR"].includes(b.kind) && (
            <>
              <section className="panel">
                <h2 id="operator-fleet">Fleet & charter pricing</h2>
                <p>
                  Rates cover the full trip or the agreed kilometers. Add tolls,
                  driver allowance and inclusions explicitly to the policy. Seat
                  ticketing is disabled.
                </p>
                <div className="market-resource-list">
                  {b.vehicles.map((v) => (
                    <article key={v.id}>
                      <strong>{v.name}</strong>
                      <p>
                        {v.registration} · {v.capacity} guests ·{" "}
                        {inr(v.ratePaise)}{" "}
                        {v.pricing === "KM" ? "per km" : "per trip"}
                      </p>
                      <p>{v.policies}</p>
                      <details>
                        <summary>Edit vehicle, rates &amp; policies</summary>
                        <form
                          className="market-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            try {
                              void run("business", {
                                action: "vehicle",
                                businessId: b.id,
                                vehicleId: v.id,
                                revision: v.revision,
                                vehicle: {
                                  name: value(f, "name"),
                                  registration: v.registration,
                                  capacity: number(f, "capacity"),
                                  pricing: value(f, "pricing"),
                                  ratePaise: paise(value(f, "rate")),
                                  minKm: number(f, "minKm"),
                                  taxBps: paise(value(f, "tax")),
                                  policies: value(f, "policies"),
                                  photos: value(f, "photos")
                                    .split("\n")
                                    .filter(Boolean),
                                  active: !!v.active,
                                },
                              });
                            } catch (e) {
                              setError(noticeError(e));
                            }
                          }}
                        >
                          <Field
                            label="Vehicle display name"
                            name="name"
                            defaultValue={v.name}
                            required
                          />
                          <Field
                            label="Vehicle capacity"
                            name="capacity"
                            type="number"
                            min={1}
                            max={100}
                            defaultValue={v.capacity}
                            required
                          />
                          <label>
                            Vehicle pricing
                            <select name="pricing" defaultValue={v.pricing}>
                              <option value="TRIP">Per trip</option>
                              <option value="KM">Per kilometer</option>
                            </select>
                          </label>
                          <Field
                            label="Vehicle rate ₹"
                            name="rate"
                            defaultValue={v.ratePaise / 100}
                            required
                          />
                          <Field
                            label="Vehicle minimum km"
                            name="minKm"
                            type="number"
                            min={1}
                            max={10000}
                            defaultValue={v.minKm}
                            required
                          />
                          <Field
                            label="Vehicle tax %"
                            name="tax"
                            defaultValue={v.taxBps / 100}
                            required
                          />
                          <label>
                            Vehicle policies
                            <textarea
                              name="policies"
                              defaultValue={v.policies}
                              minLength={20}
                              required
                            />
                          </label>
                          <label>
                            Vehicle approved photo URLs
                            <textarea
                              name="photos"
                              defaultValue={JSON.parse(v.photos).join("\n")}
                            />
                          </label>
                          <button className="btn secondary" disabled={busy}>
                            Update vehicle
                          </button>
                        </form>
                      </details>

                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() =>
                          void run("business", {
                            action: "vehicle",
                            businessId: b.id,
                            vehicleId: v.id,
                            revision: v.revision,
                            vehicle: {
                              name: v.name,
                              registration: v.registration,
                              capacity: v.capacity,
                              pricing: v.pricing,
                              ratePaise: v.ratePaise,
                              minKm: v.minKm,
                              taxBps: v.taxBps,
                              policies: v.policies,
                              photos: JSON.parse(v.photos),
                              active: !v.active,
                            },
                          })
                        }
                      >
                        {v.active ? "Pause vehicle" : "Activate vehicle"}
                      </button>
                    </article>
                  ))}
                </div>
                <form
                  className="market-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    try {
                      void run("business", {
                        action: "vehicle",
                        businessId: b.id,
                        vehicle: {
                          name: value(f, "name"),
                          registration: value(f, "registration"),
                          capacity: number(f, "capacity"),
                          pricing: value(f, "pricing"),
                          ratePaise: paise(value(f, "rate")),
                          minKm: number(f, "minKm"),
                          taxBps: paise(value(f, "tax")),
                          policies: value(f, "policies"),
                          photos: value(f, "photos")
                            .split("\n")
                            .filter(Boolean),
                          active: true,
                        },
                      });
                    } catch (e) {
                      setError(noticeError(e));
                    }
                  }}
                >
                  <Field label="Vehicle name" name="name" required />
                  <Field
                    label="Registration number"
                    name="registration"
                    required
                  />
                  <label>
                    Capacity
                    <input
                      name="capacity"
                      aria-label="Capacity"
                      type="number"
                      min={1}
                      max={100}
                      list="charter-capacities"
                      defaultValue="35"
                      required
                    />
                    <datalist id="charter-capacities">
                      {[26, 35, 40, 50].map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                    <small>26, 35, 40, 50 or custom capacity</small>
                  </label>
                  <label>
                    Pricing model
                    <select name="pricing">
                      <option value="TRIP">Per complete trip</option>
                      <option value="KM">Per kilometer</option>
                    </select>
                  </label>
                  <Field
                    label="Rate in ₹"
                    name="rate"
                    required
                    inputMode="decimal"
                  />
                  <Field
                    label="Minimum kilometers"
                    name="minKm"
                    type="number"
                    defaultValue="100"
                    min={1}
                    max={10000}
                  />
                  <Field
                    label="Applicable tax %"
                    name="tax"
                    type="number"
                    defaultValue="0"
                    min={0}
                    max={100}
                    step="0.01"
                  />
                  <label>
                    Inclusions, cancellation and payment terms
                    <textarea
                      name="policies"
                      required
                      minLength={20}
                      maxLength={3000}
                    />
                  </label>
                  <label>
                    Approved photo URLs (one per line)
                    <textarea
                      name="photos"
                      placeholder="Optional approved HTTPS images"
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    Add vehicle
                  </button>
                </form>
              </section>
              <section className="panel">
                <h2 id="operator-calendar">Availability calendar</h2>
                <MarketplaceCalendar
                  key={b.id}
                  businessId={b.id}
                  vehicles={b.vehicles}
                />
                <p>
                  Booking intervals use start date through the day before end
                  date. Reserve a blackout for maintenance or an external
                  booking before accepting new charters.
                </p>
                <form
                  className="market-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run("business", {
                      action: "blackout",
                      businessId: b.id,
                      vehicleId: value(f, "vehicleId"),
                      start: value(f, "start"),
                      end: value(f, "end"),
                      reason: value(f, "reason"),
                    });
                  }}
                >
                  <label>
                    Vehicle
                    <select name="vehicleId" required>
                      {b.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Unavailable from"
                    name="start"
                    type="date"
                    required
                  />
                  <Field
                    label="Available again on"
                    name="end"
                    type="date"
                    required
                  />
                  <Field label="Reason" name="reason" required minLength={3} />
                  <button className="btn secondary" disabled={busy}>
                    Block dates
                  </button>
                </form>
                {b.blackouts.map((x) => (
                  <p key={x.id}>
                    {b.vehicles.find((v) => v.id === x.vehicleId)?.name} ·{" "}
                    {x.start} → {x.end} · {x.reason}{" "}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void run("business", {
                          action: "removeBlackout",
                          businessId: b.id,
                          blackoutId: x.id,
                        })
                      }
                    >
                      Remove blackout
                    </button>
                  </p>
                ))}
              </section>
              <section className="panel">
                <h2 id="operator-drivers">Your drivers</h2>
                <p>
                  {b.drivers.map((d) => d.name).join(" · ") ||
                    "No drivers registered yet."}
                </p>
                <form
                  className="market-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run("business", {
                      action: "driver",
                      businessId: b.id,
                      name: value(f, "name"),
                      phone: value(f, "phone"),
                      licenseReference: value(f, "license"),
                    });
                  }}
                >
                  <Field label="Driver name" name="name" required />
                  <Field
                    label="Driver phone with country code"
                    name="phone"
                    required
                  />
                  <Field
                    label="Verified license reference"
                    name="license"
                    required
                    minLength={3}
                  />
                  <button className="btn secondary" disabled={busy}>
                    Register driver
                  </button>
                </form>
              </section>
            </>
          )}
        </>
      )}
      <section className="panel">
        <h2 id="operator-requests">Reservations & customer requests</h2>
        <p>
          {data.limitsNote} Customer details are shared only with the supplier
          and the requesting account/authorized agency managers.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Booking / guest</th>
                <th>Dates / route</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {data.bookings.map((r) => {
                const supplier = data.businesses.find(
                  (b) => b.id === r.businessId,
                );
                return (
                  <tr key={r.id}>
                    <td>
                      {r.id}
                      <br />
                      {r.customer}
                      <br />
                      {r.phone}
                    </td>
                    <td>
                      {r.start} → {r.end}
                      <br />
                      {r.route}
                    </td>
                    <td>
                      {r.status}
                      <br />
                      {r.paymentStatus}
                      <br />
                      {r.origin}
                    </td>
                    <td>
                      {inr(r.total)}
                      <br />
                      Expense {inr(r.expense)}
                    </td>
                    <td>
                      <div className="market-actions">
                        {r.hotelStayId && r.status === "HELD" && !supplier && (
                          <button
                            className="btn primary"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                const access = await readApiJson<{
                                  url: string;
                                }>(
                                  await fetch("/api/marketplace/hotel-access", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ bookingId: r.id }),
                                  }),
                                );
                                location.assign(access.url);
                              } catch (e) {
                                setError(noticeError(e));
                                setBusy(false);
                              }
                            }}
                          >
                            Continue hotel checkout
                          </button>
                        )}
                        {supplier &&
                          ["REQUESTED", "HELD", "CONFIRMED"].includes(
                            r.status,
                          ) && (
                            <button
                              className="btn secondary"
                              disabled={busy}
                              onClick={() =>
                                void run("booking", {
                                  bookingId: r.id,
                                  revision: r.revision,
                                  action:
                                    r.status === "REQUESTED"
                                      ? "hold"
                                      : r.status === "HELD"
                                        ? "confirm"
                                        : "complete",
                                })
                              }
                            >
                              {r.status === "REQUESTED"
                                ? "Hold inventory"
                                : r.status === "HELD"
                                  ? "Confirm booking"
                                  : "Complete after trip"}
                            </button>
                          )}
                        {["REQUESTED", "HELD", "EXPIRED"].includes(
                          r.status,
                        ) && (
                          <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() =>
                              void run("booking", {
                                bookingId: r.id,
                                revision: r.revision,
                                action: "cancel",
                              })
                            }
                          >
                            Cancel request
                          </button>
                        )}
                        {supplier &&
                          r.vehicleId &&
                          ["HELD", "CONFIRMED"].includes(r.status) && (
                            <select
                              aria-label={"Assign driver for " + r.id}
                              value={r.driverId || ""}
                              disabled={busy}
                              onChange={(e) =>
                                void run("booking", {
                                  bookingId: r.id,
                                  revision: r.revision,
                                  action: "driver",
                                  driverId: e.target.value,
                                })
                              }
                            >
                              <option value="">Assign driver</option>
                              {supplier.drivers.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          )}
                        {supplier &&
                          ["CONFIRMED", "COMPLETED"].includes(r.status) && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                try {
                                  void run("booking", {
                                    bookingId: r.id,
                                    revision: r.revision,
                                    action: "expense",
                                    expense: paise(
                                      value(
                                        new FormData(e.currentTarget),
                                        "expense",
                                      ),
                                    ),
                                  });
                                } catch (e) {
                                  setError(noticeError(e));
                                }
                              }}
                            >
                              <Field
                                label={"Total expense ₹ for " + r.id}
                                name="expense"
                                required
                              />
                              <button className="text-button" disabled={busy}>
                                Save expense
                              </button>
                            </form>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Commission ledger</h2>
        <p>
          Earned on completed eligible marketplace bookings. Signed refund
          adjustments reduce earned commission. This ledger does not move money.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Booking</th>
                <th>Entry</th>
                <th>Commission</th>
                <th>Platform share</th>
                <th>Agency share</th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.map((l) => (
                <tr key={l.id}>
                  <td>{l.bookingId}</td>
                  <td>{l.kind}</td>
                  <td>{inr(l.commission)}</td>
                  <td>{inr(l.platform)}</td>
                  <td>{inr(l.agency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <MarketplaceExport />
    </main>
  );
}
