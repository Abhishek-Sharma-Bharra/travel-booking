"use client";
import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/data";
import { crmReview } from "@/lib/workspace-operations/crm-review";
import { ExportButton } from "./ui";
export default function CrmReview({
  data,
  onLead,
}: {
  data: Dataset;
  onLead: (lead: Dataset["leads"][number]) => void;
}) {
  const review = useMemo(() => crmReview(data), [data]);
  const [filter, setFilter] = useState("All"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const duplicateIds = new Set(review.duplicateIds);
  const byId = new Map(review.rows.map((row) => [row.id, row]));
  const rows = review.rows.filter(
    (r) =>
      (filter === "All" ||
        (filter === "Possible duplicates"
          ? duplicateIds.has(r.id)
          : filter === "Overdue follow-ups"
            ? r.overdue
            : r.segment === filter)) &&
      `${r.customer} ${r.externalId} ${r.destination}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const exportRows = rows.map((r) => ({
    enquiry: r.externalId,
    customer: r.customer,
    destination: r.destination,
    stage: r.stage,
    segment: r.segment,
    followUp: r.followUp,
    overdue: r.overdue ? "Yes" : "No",
    contactReview: duplicateIds.has(r.id) ? "Review exact shared contact" : "",
  }));
  function open(id: string) {
    const l = data.leads.find((l) => l.id === id);
    if (l) onLead(l);
  }
  return (
    <section
      className="ops-workspace crm-review"
      aria-label="CRM review centre"
    >
      <div className="panel">
        <span className="eyebrow">RECORDED DATA · HUMAN REVIEW</span>
        <h2>CRM review centre</h2>
        <p>
          Current authorised enquiries only, as of {review.today} in{" "}
          {data.agency.timezone || "Asia/Kolkata"}. Shared contacts may be
          households or repeat enquiries. No records are merged or changed here.
        </p>
        <div className="ops-metrics">
          <article>
            <small>Accessible enquiries</small>
            <strong>{review.rows.length}</strong>
          </article>
          <article>
            <small>Enquiries sharing a contact</small>
            <strong>{review.duplicateIds.length}</strong>
          </article>
          <article>
            <small>Overdue open follow-ups</small>
            <strong>{review.overdue}</strong>
          </article>
          <article>
            <small>Closed lost enquiries</small>
            <strong>{review.lost}</strong>
          </article>
        </div>
        <p>
          Segments describe individual enquiry records. “Recorded repeat” uses
          the saved repeat-customer flag; this is neither identity matching nor
          an ML prediction. Closed lost takes precedence, then recorded repeat,
          active booking and prospective.
        </p>
        <div className="ops-actions">
          <label>
            Review group
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            >
              {[
                "All",
                "Possible duplicates",
                "Overdue follow-ups",
                ...review.segments.map((s) => s.name),
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Search review records
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Customer, enquiry ID or destination"
            />
          </label>
          <ExportButton rows={exportRows} name="crm-review" />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Enquiry</th>
                <th>Customer</th>
                <th>Segment</th>
                <th>Follow-up</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(page * 50, page * 50 + 50).map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.externalId}
                    <small>{r.destination}</small>
                  </td>
                  <td>
                    {r.customer}
                    <small>{r.stage}</small>
                  </td>
                  <td>{r.segment}</td>
                  <td>
                    {r.followUp || "Not scheduled"}
                    {r.overdue && <strong> · Overdue</strong>}
                  </td>
                  <td>
                    <button
                      className="btn secondary small"
                      onClick={() => open(r.id)}
                    >
                      Review enquiry {r.externalId}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p>No enquiries match this review group.</p>}
        <div className="ops-actions">
          <button
            className="btn secondary"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous review page
          </button>
          <span>
            {rows.length} records · page {page + 1}
          </span>
          <button
            className="btn secondary"
            disabled={(page + 1) * 50 >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next review page
          </button>
        </div>
      </div>
      <div className="panel">
        <h2>Exact-contact candidates</h2>
        <p>
          Only exact email or full phone-digit matches are grouped. Country
          codes are not guessed. Review each record; names and shared contacts
          do not prove the same customer.
        </p>
        {!review.duplicateGroups.length && (
          <p>No exact shared contacts in your accessible records.</p>
        )}
        {review.duplicateGroups.slice(0, 30).map((g) => (
          <details key={g.kind + g.value}>
            <summary>
              {g.kind === "email" ? "Email" : "Phone"}: {g.value} ·{" "}
              {g.leadIds.length} enquiries
            </summary>
            <ul>
              {g.leadIds.slice(0, 50).map((id) => (
                <li key={id}>
                  <button
                    className="btn secondary small"
                    onClick={() => open(id)}
                  >
                    {byId.get(id)?.externalId} · Open candidate
                  </button>
                </li>
              ))}
            </ul>
            {g.leadIds.length > 50 && (
              <p>
                First 50 shown. Use Possible duplicates to search all accessible
                candidates.
              </p>
            )}
          </details>
        ))}
        {review.duplicateGroups.length > 30 && (
          <p>
            First 30 shared contacts shown. Use the Possible duplicates filter
            to review all matching enquiries.
          </p>
        )}
      </div>
      <div className="panel">
        <h2>Recorded lost reasons</h2>
        <p>
          Counts reflect saved reasons, not inferred causes. Similar wording may
          remain separate.
        </p>
        <ExportButton rows={review.losses} name="lost-reasons" />
        {!review.losses.length ? (
          <p>No lost enquiries recorded.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Enquiries</th>
                </tr>
              </thead>
              <tbody>
                {review.losses.slice(0, 100).map((r) => (
                  <tr key={r.reason}>
                    <td>{r.reason}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {review.losses.length > 100 && (
          <p>
            First 100 reasons shown; export contains all accessible reasons.
          </p>
        )}
      </div>
      {[
        { title: "Recorded source outcomes", items: review.sources },
        { title: "Recorded team outcomes", items: review.employees },
      ].map((group) => (
        <div className="panel" key={group.title}>
          <h2>{group.title}</h2>
          <p>
            Current assignment and current stage, across accessible enquiry
            records. Won ÷ enquiries is a recorded-stage ratio, not a causal ad
            metric or fair employee ranking.
          </p>
          <ExportButton
            rows={group.items.map((r) => ({
              name: r.name,
              enquiries: r.enquiries,
              won: r.won,
              lost: r.lost,
              wonStagePercent: ((100 * r.won) / r.enquiries).toFixed(1),
            }))}
            name={group.title}
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Enquiries</th>
                  <th>Won stage</th>
                  <th>Lost stage</th>
                  <th>Won / enquiries</th>
                </tr>
              </thead>
              <tbody>
                {group.items.slice(0, 100).map((r) => (
                  <tr key={"id" in r ? String(r.id) : r.name}>
                    <td>{r.name}</td>
                    <td>{r.enquiries}</td>
                    <td>{r.won}</td>
                    <td>{r.lost}</td>
                    <td>{((100 * r.won) / r.enquiries).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {group.items.length > 100 && (
            <p>First 100 rows shown; export includes all accessible rows.</p>
          )}
        </div>
      ))}
    </section>
  );
}
