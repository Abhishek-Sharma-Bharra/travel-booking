"use client";
import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/data";
import { inr, indiaToday } from "@/lib/money";
import {
  customerHistory,
  departureEvents,
  supplierBalances,
  agencyBaseline,
  advisorQuestions,
  guidedBusinessAnswer,
} from "@/lib/workspace-operations/read-models";
export default function AgencyOperations({
  data,
  view,
  onLead,
  onPage,
}: {
  data: Dataset;
  view: string;
  onLead: (l: Dataset["leads"][number]) => void;
  onPage: (p: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [month, setMonth] = useState(indiaToday().slice(0, 7)),
    [customerPage, setCustomerPage] = useState(0),
    [question, setQuestion] = useState<string>(advisorQuestions[0]);
  const customers = data.leads.filter((l) =>
    `${l.customer} ${l.phone} ${l.email}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const history = customerHistory(data, selected),
    forecast = useMemo(() => agencyBaseline(data, indiaToday()), [data]),
    answer = guidedBusinessAnswer(data, question, indiaToday());
  return (
    <section className="ops-workspace" aria-label={view}>
      {view === "Customers" && (
        <>
          <div className="panel">
            <h2>Customer records</h2>
            <p>
              Each enquiry stays separate. History also shows accessible records
              with an exact matching email or phone; a shared contact can belong
              to a household.
            </p>
            <label>
              Find a customer
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCustomerPage(0);
                }}
                placeholder="Name, phone or email"
              />
            </label>
            <div className="ops-customer-grid">
              {customers
                .slice(customerPage * 50, customerPage * 50 + 50)
                .map((l) => (
                  <button
                    className="ops-record"
                    key={l.id}
                    onClick={() => setSelected(l.id)}
                    aria-pressed={selected === l.id}
                  >
                    <strong>{l.customer}</strong>
                    <span>
                      {l.destination} · {l.stage}
                    </span>
                    <small>{l.phone || l.email || "No contact recorded"}</small>
                  </button>
                ))}
            </div>
            <div className="ops-actions">
              <button
                className="btn secondary"
                disabled={!customerPage}
                onClick={() => setCustomerPage((p) => p - 1)}
              >
                Previous customers
              </button>
              <span>
                {customers.length} records · page {customerPage + 1}
              </span>
              <button
                className="btn secondary"
                disabled={(customerPage + 1) * 50 >= customers.length}
                onClick={() => setCustomerPage((p) => p + 1)}
              >
                Next customers
              </button>
            </div>
          </div>
          {history && (
            <div className="panel">
              <h2>{history.current.customer} · history</h2>
              <p>
                {history.related.length} matching enquiries ·{" "}
                {history.quotes.length} quotations · {history.bookings.length}{" "}
                bookings
              </p>
              <button
                className="btn secondary"
                onClick={() => onLead(history.current)}
              >
                Open enquiry
              </button>
              <ol className="ops-timeline">
                {history.timeline.map((t) => (
                  <li key={t.id}>
                    <time>{new Date(t.at).toLocaleString("en-IN")}</time>
                    <strong>{t.title}</strong>
                    <span>{t.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
      {view === "Departure calendar" && (
        <div className="panel">
          <h2>Departure calendar</h2>
          <label>
            Travel month
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <p>
            Departure and return dates from non-cancelled agency bookings. This
            calendar does not certify supplier inventory.
          </p>
          <div className="ops-customer-grid">
            {departureEvents(data, month).map((e) => (
              <article className="ops-record" key={e.bookingId + e.kind}>
                <time>{e.day}</time>
                <strong>
                  {e.kind} · {e.customer}
                </strong>
                <span>
                  {e.destination} · {e.status}
                </span>
                <button
                  className="btn secondary small"
                  onClick={() => onPage("Bookings")}
                >
                  View bookings
                </button>
              </article>
            ))}
          </div>
          {!departureEvents(data, month).length && (
            <p>No recorded trips in this month.</p>
          )}
        </div>
      )}
      {view === "Suppliers" && (
        <div className="panel">
          <h2>Supplier balances</h2>
          <p>
            Grouped by the supplier name entered in your manual ledger. Review
            spelling and reconcile with statements before paying.
          </p>
          {!data.access.canViewCosts ? (
            <p>Owners and managers can view supplier costs.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Net cost</th>
                    <th>Net paid</th>
                    <th>Balance</th>
                    <th>Records</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierBalances(data).map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{inr(r.cost)}</td>
                      <td>{inr(r.paid)}</td>
                      <td>{inr(r.due)}</td>
                      <td>
                        {r.entries} entries / {r.bookingIds.length} bookings
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            className="btn secondary"
            onClick={() => onPage("Transactions")}
          >
            Review ledger
          </button>
        </div>
      )}
      {view === "Demand planning" && (
        <div className="panel">
          <span className="eyebrow">RECORDED HISTORY · PLANNING BASELINE</span>
          <h2>Enquiry outlook</h2>
          <p>
            {forecast.target}. {forecast.scope}
          </p>
          {forecast.result.available ? (
            <>
              <div className="ops-metrics">
                {forecast.result.forecasts.map((f) => (
                  <article key={f.horizon}>
                    <small>Next {f.horizon} days</small>
                    <strong>{f.expected} enquiry records</strong>
                    <span>
                      Observed-pattern range {f.lower}–{f.upper}
                    </span>
                  </article>
                ))}
              </div>
              <p>{forecast.result.method}</p>
              <p>
                {forecast.result.historyDays} days of recording ·{" "}
                {forecast.result.events} events · one-day retrospective MAE{" "}
                {forecast.result.oneDayMae ?? "not yet available"}
              </p>
            </>
          ) : (
            <p className="info-box">{forecast.result.reason}</p>
          )}
        </div>
      )}
      {view === "Business advisor" && (
        <div className="panel">
          <h2>Your recorded business, explained</h2>
          <p>
            Guided answers from records you can access. No paid AI or autonomous
            actions.
          </p>
          <label>
            Ask about
            <select
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            >
              {advisorQuestions.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <h3>{answer.title}</h3>
          <p>
            {"amount" in answer
              ? inr(Number(answer.amount)) + " recorded balance remains due."
              : answer.answer}
          </p>
          <ul>
            {answer.rows.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <small>{answer.basis}</small>
        </div>
      )}
    </section>
  );
}
