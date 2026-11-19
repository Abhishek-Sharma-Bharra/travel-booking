"use client";
import { useState } from "react";
import { readApiJson } from "@/lib/api-response";
import { Field, value, noticeError } from "./marketplace-ui";
export default function MarketplaceCalendar({
  businessId,
  vehicles,
}: {
  businessId: string;
  vehicles: { id: string; name: string }[];
}) {
  const [data, setData] = useState<
      {
        day: string;
        status: string;
        bookingId: string | null;
        reason: string;
      }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div>
      <form
        className="market-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const r = await readApiJson<{ days: typeof data }>(
              await fetch(
                "/api/marketplace/calendar?" +
                  new URLSearchParams({
                    businessId,
                    vehicleId: value(f, "vehicleId"),
                    month: value(f, "month"),
                  }),
              ),
            );
            setData(r.days);
          } catch (e) {
            setError(noticeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Calendar vehicle
          <select name="vehicleId" required>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Calendar month"
          name="month"
          type="month"
          required
          defaultValue={new Date().toISOString().slice(0, 7)}
        />
        <button className="btn secondary" disabled={busy}>
          View availability calendar
        </button>
      </form>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="market-calendar" aria-label="Vehicle date availability">
        {data.map((d) => (
          <article
            key={d.day}
            className={"calendar-day " + d.status.toLowerCase()}
          >
            <strong>{d.day.slice(8)}</strong>
            <span>{d.status}</span>
            {d.reason && <small>{d.reason}</small>}
          </article>
        ))}
      </div>
    </div>
  );
}
