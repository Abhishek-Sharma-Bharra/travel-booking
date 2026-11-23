"use client";
import BusinessRecordAssistant from "./business-record-assistant";
import { useEffect, useRef, useState } from "react";
import { readApiJson } from "@/lib/api-response";
import { inr, indiaToday } from "@/lib/money";
import type { hotelOperationsOverview } from "@/lib/hotels/operations";
type Report = Awaited<ReturnType<typeof hotelOperationsOverview>>;
export default function HotelOperations({ hotelId }: { hotelId: string }) {
  const [month, setMonth] = useState(indiaToday().slice(0, 7)),
    [report, setReport] = useState<Report | null>(null),
    [tab, setTab] = useState("Dashboard"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const request = useRef<{ body: string; key: string } | null>(null),
    generation = useRef(0);
  async function load() {
    const id = ++generation.current;
    try {
      const r = await readApiJson<Report>(
        await fetch(
          `/api/hotelier/operations?hotelId=${encodeURIComponent(hotelId)}&month=${month}`,
          { cache: "no-store" },
        ),
      );
      if (generation.current === id) {
        setReport(r);
        setError("");
      }
    } catch (e) {
      if (generation.current === id) {
        setError((e as Error).message);
        setReport(null);
      }
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [hotelId, month]);
  async function record(stay: Record<string, unknown>, action: string) {
    if (
      !window.confirm(
        `Record ${action === "CHECK_IN" ? "check-in after guest identity and confirmed reservation review" : "check-out after guest departure review"}? This does not change payment or inventory.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    const body = JSON.stringify({
      hotelId,
      stayId: stay.id,
      revision: stay.revision,
      action,
      reviewed: true,
    });
    if (request.current?.body !== body)
      request.current = { body, key: crypto.randomUUID() };
    try {
      const r = await readApiJson<{ message: string }>(
        await fetch("/api/hotelier/operations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...JSON.parse(body),
            requestId: request.current.key,
          }),
        }),
      );
      setNotice(r.message);
      request.current = null;
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const total = report?.nights.reduce((n, r) => n + r.allotment, 0) || 0,
    booked = report?.nights.reduce((n, r) => n + r.booked, 0) || 0;
  return (
    <section className="ops-workspace" id="hotel-guest-operations">
      <div className="panel">
        <span className="eyebrow">HOTEL OPERATIONS</span>
        <h2>Reservations, guests & performance</h2>
        <nav className="ops-nav" aria-label="Hotel operations">
          {[
            "Dashboard",
            "Guest records",
            "Occupancy calendar",
            "Revenue & outlook",
          ].map((t) => (
            <button
              className="btn secondary"
              key={t}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="ops-actions">
          <a className="btn secondary" href="#hotel-room-inventory">
            Room rates & inventory
          </a>
          <a className="btn secondary" href="#hotel-ai-history">
            AI enquiry history
          </a>
          <a className="btn secondary" href="/operator?kind=HOTEL">
            Agency booking requests
          </a>
        </div>
        <label>
          Reporting month
          <input
            type="month"
            value={month}
            disabled={busy}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <BusinessRecordAssistant
          key={`HOTEL:${hotelId}:${month}`}
          kind="HOTEL"
          businessId={hotelId}
          month={month}
        />
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
        {!report && !error && <p role="status">Loading hotel operations…</p>}
        {report && (
          <>
            {tab === "Dashboard" && (
              <>
                <div className="ops-metrics">
                  <article>
                    <small>Configured room nights</small>
                    <strong>{total}</strong>
                  </article>
                  <article>
                    <small>Confirmed booked room nights</small>
                    <strong>{booked}</strong>
                    <span>
                      {total
                        ? ((booked / total) * 100).toFixed(1) +
                          "% of configured allotment"
                        : "Configure inventory first"}
                    </span>
                  </article>
                  <article>
                    <small>Present guests (loaded records)</small>
                    <strong>
                      {
                        report.guests.filter(
                          (g) => g.checkedInAt && !g.checkedOutAt,
                        ).length
                      }{" "}
                      reservations
                    </strong>
                  </article>
                </div>
                <p>
                  Keep room rates and allotments updated in the inventory
                  section below. Full refunds and cancellations are blocked
                  while a recorded guest stay remains open.
                </p>
              </>
            )}
            {tab === "Guest records" && (
              <>
                <p>
                  Reservations overlapping the selected month, plus open guest
                  stays. Confirmed real payments only; test reservations cannot
                  be checked in. Review guest identity according to your
                  business process.
                </p>
                {report.truncated && (
                  <p className="info-box">
                    First 200 records shown. Narrow the reporting month or
                    contact support for a complete export.
                  </p>
                )}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Guest / contact</th>
                        <th>Room / dates</th>
                        <th>Reservation</th>
                        <th>Guest presence</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.guests.map((g) => (
                        <tr key={String(g.id)}>
                          <td>
                            {String(g.customer)}
                            <small>
                              {String(g.phone)} · {String(g.email)}
                            </small>
                          </td>
                          <td>
                            {String(g.roomName)} · {String(g.rooms)} rooms
                            <small>
                              {String(g.checkIn)} → {String(g.checkOut)}
                            </small>
                          </td>
                          <td>
                            {String(g.status)} / {String(g.paymentStatus)}
                          </td>
                          <td>
                            {g.checkedInAt
                              ? `In: ${new Date(String(g.checkedInAt)).toLocaleString("en-IN", { timeZone: report.timezone })}`
                              : "Not checked in"}
                            <small>
                              {g.checkedOutAt
                                ? `Out: ${new Date(String(g.checkedOutAt)).toLocaleString("en-IN", { timeZone: report.timezone })}`
                                : ""}
                            </small>
                          </td>
                          <td>
                            {g.status === "CONFIRMED" &&
                              g.paymentStatus === "VERIFIED" &&
                              !g.checkedOutAt && (
                                <button
                                  className="btn secondary small"
                                  disabled={busy}
                                  onClick={() =>
                                    void record(
                                      g,
                                      g.checkedInAt ? "CHECK_OUT" : "CHECK_IN",
                                    )
                                  }
                                >
                                  {g.checkedInAt ? "Check out" : "Check in"}
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "Occupancy calendar" && (
              <>
                <p>
                  Hotel-local nights, excluding the check-out date. Booked room
                  nights are not a count of guests physically present.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Night</th>
                        <th>Configured allotment</th>
                        <th>Confirmed booked</th>
                        <th>Booked occupancy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.nights.map((n) => (
                        <tr key={n.day}>
                          <td>{n.day}</td>
                          <td>{n.allotment}</td>
                          <td>{n.booked}</td>
                          <td>
                            {n.allotment
                              ? ((100 * n.booked) / n.allotment).toFixed(1) +
                                "%"
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "Revenue & outlook" && (
              <>
                <h3>Provider captures</h3>
                <p>
                  {inr(report.revenue?.gross || 0)} gross /{" "}
                  {report.revenue?.captures || 0} captured payments in the
                  selected UTC month.
                </p>
                <p>{report.notes}</p>
                <h3>Booked occupancy planning</h3>
                {report.occupancyOutlook.available ? (
                  <>
                    <div className="ops-metrics">
                      {report.occupancyOutlook.forecasts.map((f) => (
                        <article key={f.horizon}>
                          <small>Next {f.horizon} hotel-local nights</small>
                          <strong>{f.expected} estimated room nights</strong>
                          <span>
                            {f.estimatedOccupancyPercent === null
                              ? "Configure all future nights to estimate occupancy"
                              : `${f.estimatedOccupancyPercent}% of configured allotment`}
                          </span>
                          <span>
                            Observed-pattern range {f.lower}–{f.upper} room
                            nights
                          </span>
                        </article>
                      ))}
                    </div>
                    <p>{report.occupancyOutlook.basis}</p>
                  </>
                ) : (
                  <p className="info-box">{report.occupancyOutlook.reason}</p>
                )}
                <h3>Reservation-request planning baseline</h3>
                <p>
                  UTC request creation dates, not guaranteed bookings or income.
                  No paid forecasting service.
                </p>
                {report.baseline.available ? (
                  <>
                    <div className="ops-metrics">
                      {report.baseline.forecasts.map((f) => (
                        <article key={f.horizon}>
                          <small>Next {f.horizon} days</small>
                          <strong>{f.expected} requests</strong>
                          <span>
                            Observed range {f.lower}–{f.upper}
                          </span>
                        </article>
                      ))}
                    </div>
                    <p>{report.baseline.method}</p>
                  </>
                ) : (
                  <p>{report.baseline.reason}</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
