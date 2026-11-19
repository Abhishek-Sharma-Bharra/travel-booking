"use client";
import { useState } from "react";
import { Field, value, noticeError } from "./marketplace-ui";
import { readApiJson } from "@/lib/api-response";
export default function MarketplaceExport({
  admin = false,
}: {
  admin?: boolean;
}) {
  const [cursor, setCursor] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>Download reports</h2>
      <p>
        Choose up to 93 days. Each download contains up to 500 rows; use the
        next page button to continue.
      </p>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <form
        className="market-form"
        onChange={() => setCursor("")}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const query = new URLSearchParams({
              kind: value(f, "kind"),
              from: value(f, "from"),
              to: value(f, "to"),
              ...(cursor ? { cursor } : {}),
              ...(admin ? { admin: "true" } : {}),
            });
            const r = await fetch("/api/marketplace/report?" + query);
            if (!r.ok) await readApiJson(r);
            const blob = await r.blob(),
              url = URL.createObjectURL(blob),
              a = document.createElement("a");
            a.href = url;
            a.download = "travelos-" + value(f, "kind").toLowerCase() + ".csv";
            a.click();
            URL.revokeObjectURL(url);
            setCursor(r.headers.get("X-Next-Cursor") || "");
          } catch (e) {
            setError(noticeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Report
          <select name="kind">
            <option value="BOOKINGS">Bookings and expenses</option>
            <option value="COMMISSION">
              Commission and refund adjustments
            </option>
            <option value="SETTLEMENT">External settlements</option>
          </select>
        </label>
        <Field label="Report from" type="date" name="from" required />
        <Field
          label="Report until (exclusive)"
          type="date"
          name="to"
          required
        />
        <button className="btn secondary" disabled={busy}>
          {cursor ? "Download next page" : "Download CSV"}
        </button>
      </form>
    </section>
  );
}
