"use client";
import BusinessRecordAssistant from "./business-record-assistant";
import { useState, useEffect } from "react";
import { readApiJson } from "@/lib/api-response";
import { inr, indiaToday } from "@/lib/money";
import type { transportOperations } from "@/lib/marketplace/operations";
type Report = Awaited<ReturnType<typeof transportOperations>>;
export default function TransportOperations({
  businessId,
}: {
  businessId: string;
}) {
  const [month, setMonth] = useState(indiaToday().slice(0, 7)),
    [data, setData] = useState<Report | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void fetch(
      `/api/marketplace/operations?businessId=${encodeURIComponent(businessId)}&month=${month}`,
      { cache: "no-store" },
    )
      .then(readApiJson<Report>)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [businessId, month]);
  const reserved = data?.days.reduce((n, d) => n + d.occupied, 0) || 0,
    capacity = (data?.fleet || 0) * (data?.days.length || 0);
  return (
    <section className="ops-workspace" id="operator-report">
      <div className="panel">
        <h2>Fleet operations & reports</h2>
        <nav className="ops-nav" aria-label="Transport workspace">
          <a className="btn secondary" href="#operator-fleet">
            Fleet & pricing
          </a>
          <a className="btn secondary" href="#operator-calendar">
            Availability
          </a>
          <a className="btn secondary" href="#operator-drivers">
            Drivers
          </a>
          <a className="btn secondary" href="#operator-requests">
            Trips & expenses
          </a>
        </nav>
        <label>
          Trip start month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <BusinessRecordAssistant
          key={`TRANSPORT:${businessId}:${month}`}
          kind="TRANSPORT"
          businessId={businessId}
          month={month}
        />
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {!error && !data && (
          <p role="status">Loading scoped business report…</p>
        )}
        {data && (
          <>
            <div className="ops-metrics">
              <article>
                <small>Booking requests</small>
                <strong>{data.summary?.requests || 0}</strong>
              </article>
              <article>
                <small>Booked net sales</small>
                <strong>{inr(data.summary?.bookedNet || 0)}</strong>
              </article>
              <article>
                <small>Recorded trip expenses</small>
                <strong>{inr(data.summary?.expenses || 0)}</strong>
              </article>
              <article>
                <small>Recorded direct contribution</small>
                <strong>
                  {inr(
                    (data.summary?.bookedNet || 0) -
                      (data.summary?.expenses || 0),
                  )}
                </strong>
              </article>
              <article>
                <small>Documented verified collections</small>
                <strong>{inr(data.summary?.verifiedCollections || 0)}</strong>
              </article>
              <article>
                <small>Reserved vehicle days / current fleet days</small>
                <strong>
                  {reserved} / {capacity}
                </strong>
                <span>
                  {capacity
                    ? ((100 * reserved) / capacity).toFixed(1) + "%"
                    : "No active fleet"}
                </span>
              </article>
            </div>
            <p>{data.basis}</p>
            <h3>Demand planning baseline</h3>
            <p>
              Requests captured by this business in UTC. No live seat tickets or
              paid AI.
            </p>
            {data.baseline.available ? (
              <>
                <div className="ops-metrics">
                  {data.baseline.forecasts.map((f) => (
                    <article key={f.horizon}>
                      <small>Next {f.horizon} days</small>
                      <strong>{f.expected} requests</strong>
                      <span>
                        Observed-pattern range {f.lower}–{f.upper}
                      </span>
                    </article>
                  ))}
                </div>
                <p>{data.baseline.method}</p>
              </>
            ) : (
              <p className="info-box">{data.baseline.reason}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
