# Feature checklist

Status describes the implemented MVP, not a production-readiness claim.

| Area | Status | Scope / limitations |
|---|---|---|
| Agency signup, login, logout | Implemented | Better Auth passwords, server sessions; each signup gets a separate agency |
| Server tenant isolation | Implemented | Fresh DB-backed actor on every authenticated request; scope includes agency and agent assignment; direct and HTTP attack tests |
| Owner / manager / agent | Implemented | Owners manage users; managers manage packages, spend and supplier entries; agents handle assigned sales/receipts/refunds |
| Team access | Implemented | Owner creates member with initial password, changes role, disables access and revokes sessions; no invitation emails |
| Enquiries | Implemented | Create, edit, search, source/date/destination/person/stage filters, assignment, notes and lost reason |
| Follow-ups and activity | Implemented | Schedule, overdue review, log completion and next date; persisted audit history |
| Pipeline | Implemented | Interactive cards and detail/edit controls; no drag-and-drop; first 30 per stage with list/search for all |
| CSV import | Implemented | 500-row limit, preview, row errors, server Zod validation, atomic insert and tenant-scoped unique external IDs |
| Packages | Implemented | Create/edit, duration, inclusions, exclusions, selling price, estimated supplier cost |
| Quotations | Implemented | Snapshotted prices, package details, travel dates, integer paise discounts/tax, browser print/PDF; accept once |
| Bookings | Implemented | Single booking per lead and quote, dates, supplier confirmation, status and cancellation fee |
| Manual transaction ledger | Implemented | Partial receipts, refunds, expenses, supplier payments/credits, date and memo; append-only UI |
| Balances and contribution | Implemented | Decimal-safe money; no duplicate supplier expense deduction; cancelled sales use fee; current balances |
| Marketing dashboard | Implemented | Source performance, manual monthly ad/operating spend, CPL, acquisition cost, explicit first-touch booked-value ROAS |
| Monthly report | Implemented | Month, dimensions, funnel, net collections, current overdue balances, completed follow-up events, source/package results, prior-month comparison, transparent actions and print/PDF |
| Historical accounting reports | Partial | Current state of cohorts; no point-in-time snapshots or closed accounting periods; not GST/TCS accounting |
| Synthetic ML | Implemented | Reproducible sklearn training, held-out evaluation, exported coefficients, 80 inference parity fixtures, missing/range handling and labelled explanations |
| Real-world agency model | Deferred | No validation on real agency data, automatic retraining, causal or revenue-lift claims |
| Isolated read-only demo | Implemented | 1,500 fictional enquiries; 330 bookings (30 cancelled); six completed months; interactive non-persisted calculator |
| Agency settings / logo / footer | Implemented | Owner settings, HTTPS image URL, contact details, printable footer |
| Subscription management | Implemented, manual | Stored plan/status and operator-only CLI update with audit; no billing or plan quota enforcement |
| Exports | Implemented | Filtered enquiry/booking/transaction/marketing/report CSVs; Settings exports all accessible tables; formula neutralisation; money unit labels or raw paise in full-record exports |
| Onboarding and audit | Implemented | Owner checklist; important booking, ledger, enquiry and role changes recorded |
| Backup / restore | Implemented for local development | Dump helper and documented restore; hosted backup automation remains deployment work |
| Production operations | Deferred | Hosting, custom domain, real secrets, email verification/recovery, external audit, monitoring and deployment backup policy |
| Performance / accessibility | Partial | Responsive UI, labels/loading/errors and basic browser coverage; client loads permitted dataset; no server pagination, full keyboard/focus audit or scale/load test |
| Financial correction workflow | Partial | Refunds and unpaid supplier credits supported; paid supplier refunds, expense deletion, ledger reversal approvals and accounting reconciliation need further work |

Sensitive identity document upload, payment processing, live subscription billing and invented testimonials/results are deliberately excluded.
