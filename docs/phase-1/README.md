# Phase 1 — advanced KPI dashboard

This release extends the existing Next.js/PostgreSQL application. Render production is unchanged. External payment/ad/message providers and Cloudflare migration are not implemented in this phase.

## Review the result

Use Node 24 per `.nvmrc`. Work against a **local or isolated staging** PostgreSQL database; do not point development/test commands at production. Back up existing staging records first. Install with `npm ci`, run `npm run db:generate`, `npm run db:migrate`, then `npm run db:seed` only if fictional demo data is wanted. Existing demo seed is not reset. Run `npm run build` and `npm run start`, or `npm run dev` locally. Keep secrets in private environment settings.

Open **Analytics** in the workspace navigation, or **Overview → Open advanced analytics**. Agents get their assigned-data analytics and existing priorities on Overview. Owner/manager legacy overview and reports remain available with a visible legacy-definition notice. The advanced report has its own filters; it does not silently reinterpret old reports as verified/accounting data.

For the existing historical fictional demo, select **1 April–30 September 2026** rather than a November window with no demo enquiries. Empty/current-period results are legitimate. Controls: Today, This week (Monday start), This month, custom From/To; destination, source, agent and package; day/week/month trends; previous equal-calendar-day period; destination/agent/source/package performance and CSV section export. A campaign selector is explicitly unavailable until authorized campaign identifiers and attribution exist. Changing the chart interval does not change the reporting dates.

Owner **Settings → Edit agency profile → Reporting timezone (IANA)** selects a validated timezone, such as Asia/Kolkata or America/New_York. Existing agencies default to Asia/Kolkata; UTC event timestamps are not rewritten. Amounts remain INR/paise; this is not a new multicurrency ledger.

## Backend and data contract

- `src/lib/reporting-time.ts`: local calendar dates, validated IANA zones, UTC half-open boundaries and full-calendar-month checks. DST can produce 23/25-hour days.
- `src/lib/kpi-service.ts`: fresh user-role/agency checks; tenant+assignment scope; PostgreSQL aggregates, comparisons, trends and **20-row server-paginated performance groups**; a repeatable-read snapshot keeps result sections consistent. No transaction or customer-row lists are returned by this API.
- `src/app/api/analytics/route.ts`: authenticated, no-store, rate-limited GET; explicit public `demo=1` uses only the server-selected fictional agency. Arbitrary agency IDs are not accepted. Public-demo requests share a bounded request bucket; there is no paid-provider invocation.
- `src/components/advanced-analytics.tsx`: responsive filters/cards, definitions/comparisons, selectable trend bars, accessible table fallback, paged performance, CSV, timeout/retry and aborted/stale request handling.
- `src/lib/financial-redaction.ts` and `data.ts`: agent serialized data removes internal package/quote supplier estimates/rate notes and cost metadata, supplier ledger entries and supplier financial audit events, including nested quote/package copies. Hidden widgets alone are not security.
- `actions.ts`: manager direct-cost completeness and owner advertising completeness declarations, audit records, stale-revision checks; supplier-cost pricing restricted to managers/owners. Existing recorded selling-rate sales workflow remains available to agents.

KPI API filters: from/to (valid dates, 1–366 calendar days), destination/source, agent/package, grain day/week/month, breakdown destination/agent/source/package and nonnegative page. Unknown or foreign package/agent IDs are rejected; agents cannot select another teammate. Campaign selection returns a clear unavailable error until the appropriate later phases exist. CSV is generated from the displayed server response; monetary values carry **INR paise** unit labels, ratios are fractions, timestamps/period/timezone are included and spreadsheet formulas are neutralized. Performance CSV exports the **current page**, not a disguised unbounded full export.

## Financial definitions and missing data

- Enquiries use their recorded date-only enquiry dates. Bookings use created-at timestamps in the agency timezone. Manual receipts/refunds use their own recorded dates independently of booking creation. Existing date-only ledger inputs remain CALENDAR dates; explicitly timestamped INSTANT rows use agency-timezone boundaries. They are not reclassified as provider-verified.
- Qualified leads are current Qualified/Quoted/Won within the enquiry cohort. Conversion follows that same cohort into current non-cancelled bookings. Confirmed and Completed are separate. Cancellation rate uses the booking-created cohort, not cancellation-event timestamps.
- Gross booking value includes original cancelled commitments; cancellation-adjusted value uses the recorded fee for cancelled bookings. These are commitments including recorded quote tax, not recognized revenue.
- Manual receipts, manual refunds and manual net recorded cash are labelled separately from **verified** collections. Current outstanding uses all recorded allocated receipts/refunds for the selected booking-created cohort; it is not a historical as-of balance.
- Verified collections, provider failures, fees and settlements remain **Data unavailable** until Phase 2 provides verified provenance. Recognized revenue and net profit remain **Data unavailable** because accounting recognition/category completeness do not exist. There is no invented provider connection or zero-filled provider history.
- Recorded direct cost subtotal is expenses minus supplier credits. Contribution requires an explicit manager completeness declaration on **every** booking in the group. Contribution is before ads/overheads/fees and sales-tax reconciliation; commitments still include recorded quote tax. It is not tax-exclusive accounting profit. Ratio unavailable when sales denominator is nonpositive.
- Changing a direct expense/credit invalidates cost completeness and advances a monotonic booking revision through DB triggers. Stale browser declarations are rejected. Reconcile the latest costs, then use **Bookings → Attest direct costs complete**. Zero costs require an explicit declaration, not an inferred absence of expenses.
- Existing ads data is monthly manual Spend, not daily provider facts. Partial-month exact spend is unavailable. A separate **recorded monthly subtotal** can include touched-month days outside the range and is labelled as such.
- Owner can attest completeness for exact closed historical full-calendar-month/source ranges in Analytics after reconciliation. This is an **owner declaration**, not provider verification. Only then can aligned manual spend/CPL/CAC appear; zero spend is accepted only through explicit completeness. Source-filtered ratios match that source's CRM leads; unfiltered ratios are blended across sources including organic enquiries. Destination/agent/package spend allocation is unavailable and disables those ratios.
- Advertising changes invalidate declarations and advance an agency revision, including direct SQL writes. Timezone changes cannot reuse declarations from the old timezone. Claims are row-lock/revision protected.
- Equal-day comparisons are **calendar-window comparisons, not elapsed-time pace normalization**; today's activity may be partial. The UI explicitly discloses this. Source/current-assignee results are current attribution; historical source/assignment events are not fabricated. Package leads can overlap when an enquiry has quotes for multiple packages, so per-package lead rows need not sum to agency total.

See the Phase 0 KPI contract for future accounting/provider requirements; the explicit Phase 1 limitations above are the implemented scope.

## Migrations and rollout safety

Three additive migrations:

1. `20261110000000_analytics_foundations`: Agency.timezone; Booking.directCostsComplete default false; ReportingCoverage; date-query indexes.
2. `20261110001000_coverage_invalidation`: Agency.adSpendRevision and Booking.costRevision plus two PostgreSQL invalidation triggers.
3. `20261110002000_ledger_date_basis`: Transaction.dateBasis defaults to CALENDAR, preserving the date-only semantics of the existing manual entry form; explicit timestamp records can use INSTANT. Existing date values are not rewritten.

No existing receipt becomes verified and no historical cost/spend becomes complete automatically. Existing INR values, quotations, users and records are retained. The new complete flags must never be blindly backfilled true. Use migration-owner credentials in a controlled release job, not in the serving app. Existing runtime role must have DML on the new table; rerun/review explicit grants if provisioned before it existed. Trigger functions use invoker permissions and qualified public tables; no security-definer escalation is introduced.

PrismaPg 7.10.1's migration `executeScript` splits at every semicolon, including inside trigger bodies. `scripts/migrate.ts` now delegates trusted migration batches to PostgreSQL through the adapter's underlying driver so PostgreSQL parses PL/pgSQL correctly and batches are atomic. No node_modules, TLS or integrity settings were patched. A fresh disposable DB test applied all **12 migrations** and found both triggers, then removed that disposable DB. The initial local trigger attempt failed before this helper correction; its failed history was preserved with the schema engine's official rolled-back marker and the local migration was reapplied without resetting existing data. No production repair was performed.

Stage on a restored/sanitized separate DB first. Compare counts, balances and quotes; test owner/manager/agent response bodies and exports; verify cost/spend invalidation and coverage revisions. Keep old columns and use a forward-compatible rollback to the prior safe release. Do not drop migrations or restore a stale DB over new writes as an automatic rollback. Existing Render origin, database and DNS remain untouched until staging evidence and explicit cutover approval.

## Performance and operational limits

The advanced endpoint performs aggregation/pagination in PostgreSQL; the legacy workspace loader still fetches its permitted dataset for existing CRM screens. This is **not** a claim of complete server pagination across the application or a production load certification. Representative agency-volume tests, cross-browser/full accessibility review, strict nonce CSP, backups/monitoring and independent hosted security review remain operational gates. Query ranges/timeouts/rate limits bound work; an aborted browser request may already have reached the DB.

Test files run sequentially at the npm script level because parallel integration files share a local DB and unrelated SERIALIZABLE fixture writes can conflict via PostgreSQL predicate locks. Explicit in-test concurrency checks (such as the shared limiter) remain concurrent and no assertions were removed. This does not alter production isolation or suppress real failed requests. CI now includes the feature branch; a hosted CI run is not claimed from local evidence.
