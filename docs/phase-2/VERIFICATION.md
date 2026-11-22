# Phase 2 verification — 22 November 2026

All checks below were local. No remote database was modified; no production deployment was attempted.

| Check | Result |
|---|---|
| `npm run typecheck` | Passed on final files. |
| `npm test` | 147 tests passed, 0 failed. Covers existing auth/CRM, D1 atomic inventory and payment safety, permissions, campaigns, integrations, subscriptions and new workspace operations. |
| Final itinerary suite after history metadata/source-package hardening | 6 tests passed on PostgreSQL + ephemeral D1. Conflicting revisions, immutable history, replayed requests/quotes, reassignment, cross-tenant access and agent cost redaction verified. |
| Cloudflare browser suite | All 20 tests passed across Pages → private Worker → persisted local D1. |
| Final Phase 2 browser retest after history hardening and explicit AI navigation | All 3 workflows passed again: itinerary/quotation/history/print/finance/mobile, bus/car selection/report, hotel check-in/out/occupancy/mobile. |
| SEO/crawler browser suite | 2 tests passed. Public metadata/canonical links and private-route exclusions retained. |
| Cloudflare production build | Passed on final code, including Next TypeScript and OpenNext Worker/assets generation. |
| `npm run d1:schema:check` | Passed. Frozen baseline's 35 ORM models unchanged; new tables are additive SQL-managed migrations. |
| Production dependency audit | `npm audit --omit=dev` reports 0 vulnerabilities. |
| Local concurrent request smoke | 12 requests across homepage, hotel entry, BUS public search and private operations endpoint; public paths returned 200, unauthenticated private API 401, API responses JSON, no 5xx. Not a capacity/load guarantee. |
| Print review | Generated A4 itinerary and agency voucher PDFs; readable text, source terms, explicit manual-payment/supplier warnings; private costing omitted from itinerary print. |
| Mobile review | 390 px agency/hotel/transport checks, menu-collapse check and scoped horizontal table scrolling. Desktop/mobile captures inspected. |

## Safety cases

- Disabling a user or changing agency/lead assignment removes itinerary access, including old versions. Private supplier cost data is redacted server-side for agents.
- Save versions and quotation links are atomic; same request/version does not produce a duplicate document/quote. A changed idempotency payload is rejected. History cannot be updated or deleted through ordinary writes.
- The source package stays fixed for a document's history; historical title/date/day metadata derives from that version's payload.
- Hotel holds and captured sandbox payments cannot be checked in. Real confirmed/provider-verified state and the reserved local date window are required.
- Concurrent guest check-out records one event. Guest operations preserve reservation payment state and reserved nights. A property edit returning it to review does not prevent an already-present guest from checking out.
- Open guest stays block marketplace cancellation/full refund, including when the new UI feature flag is disabled. Existing provider/refund review controls remain intact.
- Transport reports cannot read another business owner's records and do not use a truncated latest-100 list to calculate totals. Tax/refund treatment and full-vehicle utilization are explicitly labeled.
- New API gateway paths sanitize upstream HTML/errors to private JSON; writes are not blindly retried.

## Production limits still requiring rollout verification

The old production 500/1101 route-loading incident is not declared fixed by these local results. The environment's network policy does not permit direct verification of the live site. Follow the deployment checklist, inspect the original live exception, and verify the reviewed deployment/flags/bindings before declaring production healthy. Runtime CPU, D1 storage and onboarding capacity need actual production usage evidence; no number of agencies/hotels is promised here.
