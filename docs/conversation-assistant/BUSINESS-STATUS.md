# Business readiness: one platform, several workspaces

23 November 2026. Scope is based on repository audit and tests, not a claim that every production route/provider was externally verified. User confirmed the latest premium design on the live site.

| Area | Implemented | Still required for commercial automation |
|---|---|---|
| Public website | One unified homepage, features/pricing/demo/contact and role-specific entry points | Customer acceptance, confirmed sales terms and onboarding |
| Agency | Tenant-isolated CRM, enquiry capture, team roles, packages, itineraries/costing, quotations, recorded bookings/payments, calendar, customers, suppliers, reports/export | Production-volume/load validation; real payment-provider reconciliation |
| Hotel | Property/room registration and review, rates/date inventory, temporary holds, reservations, guest check-in/out and reporting | Real-world operator inventory synchronisation; approved hotel-specific payment accounts before live collection |
| Bus/car | Business/fleet registration, charter requests, availability, supplier confirmation/driver and operational reports | Operator adoption and reliable inventory updates; no seat-level ticketing |
| Customer assistant | Isolated campaign/package and hotel guest conversations, maintained facts and scoped requests/holds | Approved live AI/provider configuration; verified inventory/payment before any booking confirmation |
| Agency owner assistant | Authenticated read/draft tools, exact-rate previews, follow-up help, usage/quotas and reviewed workflow handoffs; this upgrade adds ephemeral multi-turn chat and capability help | Live model pilot with secure key/allowlist; broader hotel/transport owner tools and approved outbound actions remain separate scope |
| Subscriptions | Trial/access/limits, manual owner billing requests and admin review | Merchant readiness, agreed prices/taxes/refund terms, test checkout/webhooks/reconciliation, invoices/renewals and explicit live activation |
| Advertising/messaging | Integration scaffolding and guarded send/provider gates | Meta/Google applications, review and OAuth scopes; approved sender/consent and delivery validation |
| Production | User-confirmed premium deployment, repository CI checks; additive migrations/release checks | Ongoing monitored smoke tests, live backups/restore verification, operational support and error/load measurements |

No percentage such as “100% complete” or unsupported capacity/client count is reported. A working UI and CI pass do not establish commercial demand, payment compliance or unrestricted Free-plan scale. Existing commission records/contracts are not silently removed; the later subscription-only commercial model needs an explicit contract transition rather than changing existing customer agreements.

## Remaining dependencies

- Securely configure a provider API key and approved, budget-limited pilot before enabling live AI. Do not place it in public environment variables or chat.
- Confirm merchant Test Mode readiness. Build/validate subscription financial flows against approved test credentials; browser success redirects never activate paid access.
- Approve specific automation actions and limits after testing; read/draft automation is distinct from external messages, payments, refunds and confirmed inventory.

Current chat conversation state is held only in component memory, bound to the authenticated actor/agency. The server independently rechecks access and usage on each lookup. No transcript is persisted or silently supplied to a model; each request explicitly includes its current selected context.
