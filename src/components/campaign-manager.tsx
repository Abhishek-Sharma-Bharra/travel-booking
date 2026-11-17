"use client";
import { useEffect, useState } from "react";
import type { Dataset } from "@/lib/data";
import styles from "./trip-sales.module.css";
type Campaign = {
  id: string;
  title: string;
  enabled: boolean;
  expiresAt: string;
  requests: number;
  url: string;
};
export default function CampaignManager({ data }: { data: Dataset }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await fetch("/api/campaigns");
      const value = await response.json();
      if (!response.ok) throw Error(value.error || "Could not load campaigns");
      setCampaigns(value.campaigns);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (data.actor.role === "OWNER" && !data.demo) void load();
  }, [data.actor.role, data.demo]);
  async function save(body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error || "Could not save campaign");
      setMessage(value.url ? `Published: ${value.url}` : value.message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (data.demo)
    return (
      <div className="panel">
        <h2>Ad campaign links</h2>
        <p>
          Owners can publish selected packages, share a customer landing page,
          and receive booking requests in their agency CRM. The fictional demo
          is read-only.
        </p>
      </div>
    );
  if (data.actor.role !== "OWNER")
    return (
      <div className="panel">
        <p>Your agency owner manages public package publishing.</p>
      </div>
    );
  return (
    <div className={styles.manager}>
      <p className={styles.managerNote}>
        Publish an agency-branded landing page for Meta, Google or WhatsApp
        links. Customers explore your approved packages, ask the travel
        assistant questions and send a booking request. A request creates an
        enquiry and draft quotation; supplier availability and booking
        confirmation remain your responsibility. No payment is collected.
      </p>
      <section className="panel">
        <h2>Create an ad landing page</h2>
        <p>
          Complete itinerary, selling price, payment terms and cancellation
          policy in Packages first. Published details are snapshots; pause the
          old link and publish a new one when prices or terms change.
        </p>
        <form
          className={styles.managerForm}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              action: "publish",
              input: {
                title: f.get("title"),
                packageIds: selected,
                tax: f.get("tax"),
                expiresOn: f.get("expiresOn"),
                approved: f.get("approved") === "on",
              },
            });
          }}
        >
          <label>
            Campaign title
            <input
              name="title"
              required
              minLength={3}
              maxLength={120}
              placeholder="Your next escape, thoughtfully planned"
            />
          </label>
          <fieldset>
            <legend>Packages to publish (up to 12)</legend>
            {data.packages.map((p) => (
              <label className={styles.checkRow} key={p.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, p.id]
                        : s.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name} · {p.destination}
              </label>
            ))}
            {!data.packages.length && (
              <p>Add your first package before creating a campaign.</p>
            )}
          </fieldset>
          <label>
            Tax added to the published per-person price (%)
            <input
              name="tax"
              type="number"
              min={0}
              max={100}
              step="0.01"
              required
              defaultValue="0"
            />
          </label>
          <label>
            Rates valid through ({data.agency.timezone})
            <input
              name="expiresOn"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label className={styles.checkRow}>
            <input name="approved" type="checkbox" required />I approve these
            packages, prices, tax treatment and policies for public display.
            These are enquiry rates; availability must be checked before
            confirming bookings.
          </label>
          <button
            className="btn"
            disabled={busy || selected.length === 0 || selected.length > 12}
          >
            {busy ? "Saving…" : "Publish campaign link"}
          </button>
        </form>
      </section>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <section className="panel">
        <h2>Your campaign links</h2>
        <div className={styles.managerList}>
          {campaigns.map((c) => (
            <article className={styles.campaignRow} key={c.id}>
              <strong>{c.title}</strong>
              <p>
                {c.enabled && c.expiresAt > new Date().toISOString()
                  ? "Published"
                  : "Paused / expired"}{" "}
                · {c.requests} booking requests · Expires{" "}
                {new Date(c.expiresAt).toLocaleDateString("en-IN")}
              </p>
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                Open customer page ↗
              </a>
              <p>
                {c.url}
                ?utm_source=meta&amp;utm_medium=paid_social&amp;utm_campaign=your-campaign
              </p>
              <button
                className="btn secondary small"
                disabled={busy}
                onClick={() => {
                  void navigator.clipboard.writeText(c.url).then(
                    () => setMessage("Campaign link copied"),
                    () => setError("Copy the link shown above manually."),
                  );
                }}
              >
                Copy link
              </button>
              {c.enabled && (
                <button
                  className="btn secondary small"
                  disabled={busy}
                  onClick={() => void save({ action: "pause", id: c.id })}
                >
                  Pause link
                </button>
              )}
            </article>
          ))}
          {!campaigns.length && (
            <p>
              No campaign links yet. Publishing is explicit; your private
              packages are never listed automatically.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
