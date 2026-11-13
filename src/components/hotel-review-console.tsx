"use client";
import { HotelBrandHeader } from "./hotel-brand";
import { useState } from "react";
import type { hotelReviewQueue } from "@/lib/hotels/service";
type Queue = Awaited<ReturnType<typeof hotelReviewQueue>>;
export default function HotelReviewConsole({ initial }: { initial: Queue }) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function decide(
    e: React.FormEvent<HTMLFormElement>,
    hotelId: string,
    revision: number,
  ) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin/hotels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hotelId,
            revision,
            decision: f.get("decision"),
            reason: f.get("reason"),
            businessVerified: f.get("verified") === "on",
          }),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.error || "Review failed");
      const next = await fetch("/api/admin/hotels", { cache: "no-store" }),
        body = await next.json();
      if (!next.ok) throw Error(body.error || "Refresh failed");
      setData(body);
      setNotice("Review recorded with revision and audit trail.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="hotel-shell hotel-branded">
      <HotelBrandHeader review />
      <header className="hotel-header">
        <div>
          <span className="eyebrow">PLATFORM REVIEW</span>
          <h1>Hotel verification</h1>
          <p>
            Verified administrator and fresh MFA session required for every
            decision.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="info-box">
          {notice}
        </p>
      )}
      <p className="hotel-stage-note">
        Approval here records your business verification decision. This stage
        does not publish a booking marketplace or enable payments.
      </p>
      {!data.hotels.length && <p>No hotel registrations yet.</p>}
      {data.hotels.map((h) => (
        <section key={h.id} className="hotel-review-card">
          <div className="hotel-section-header">
            <div>
              <h2>{h.name}</h2>
              <p>
                {h.city}, {h.countryCode} · {h.status} · Revision {h.revision}
              </p>
            </div>
            <span className="subtle-tag">{h.rooms.length} categories</span>
          </div>
          <p>
            {h.address} · {h.contactEmail} · {h.contactPhone}
          </p>
          <details>
            <summary>Profile and room review</summary>
            <p>Amenities: {h.amenities.join(", ") || "Not recorded"}</p>
            <p>
              Tax: {h.taxBps / 100}% · Timezone: {h.timezone}
            </p>
            <h3>Hotel policies</h3>
            <p className="hotel-policy-copy">{h.policies || "Not recorded"}</p>
            <h3>Cancellation policy</h3>
            <p className="hotel-policy-copy">
              {h.cancellationPolicy || "Not recorded"}
            </p>
            {h.rooms.map((r) => (
              <p key={r.id}>
                {r.name}: {r.totalRooms} rooms; {r.maxAdults} adults /{" "}
                {r.maxChildren} children, {r.maxOccupancy} combined;{" "}
                {r.active ? "active" : "inactive"}
              </p>
            ))}
            {h.photoUrls.map((url, i) => (
              <a key={url} href={url} rel="noreferrer noopener" target="_blank">
                Open approved-host photo reference {i + 1}{" "}
              </a>
            ))}
          </details>
          {h.reviewReason && <p>Last decision: {h.reviewReason}</p>}
          {["PENDING", "APPROVED"].includes(h.status) && (
            <form
              key={h.id + h.revision}
              onSubmit={(e) => decide(e, h.id, h.revision)}
            >
              <fieldset disabled={busy}>
                <legend className="sr-only">Review {h.name}</legend>
                <div className="hotel-form-grid">
                  <label>
                    Decision for {h.name}
                    <select name="decision">
                      {h.status === "PENDING" ? (
                        <>
                          <option value="APPROVED">Approve</option>
                          <option value="REJECTED">Reject</option>
                        </>
                      ) : (
                        <option value="SUSPENDED">Suspend</option>
                      )}
                    </select>
                  </label>
                  <label>
                    Review reason for {h.name}
                    <textarea
                      name="reason"
                      minLength={10}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <label className="hotel-check span-2">
                    <input name="verified" type="checkbox" />I have
                    independently checked this hotel's business identity,
                    authorization, policies and tax configuration. Required for
                    approval.
                  </label>
                </div>
                <button className="btn primary">
                  Record decision for {h.name}
                </button>
              </fieldset>
            </form>
          )}
        </section>
      ))}
    </main>
  );
}
