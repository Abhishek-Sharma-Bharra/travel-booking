# B2B marketplace audit and implementation plan

19 November 2026. Additive extension of the existing Pages → private Worker → D1 application.

## Audit

Existing Better Auth identities, agency roles and tenant membership stay authoritative. Super-admin access uses the existing verified-email allowlist plus recent MFA. Hotels already have review, room categories, atomic nightly holds, merchant-specific signature/capture verification and native D1 batches. Existing agency subscriptions are manual access records; they must not be repriced or replaced implicitly. D1 interactive Prisma transactions intentionally fail closed; new multi-row work must use guarded native batches. Workers/Pages deploy independently; keep existing asset fallback and failure handling.

## Migration proposal

`0005_b2b_marketplace.sql` only creates new, indexed SQL-managed tables: business registrations (optional links to existing agency/hotel), editable plans, opt-in subscriptions, accepted commercial agreements, vehicles, drivers, blackout intervals, booking requests and price/commission snapshots, immutable commission entries, externally verified settlement records, audit events and daily usage counters. No existing table or customer data is dropped/repriced. INR amounts are integer paise; percentages are basis points. Trial access is free and never creates payment orders.

## Integration and implementation phases

1. One homepage with agency, hotel, bus, car, assistant, pricing and registration sections; preserve existing routes and light theme.
2–3. Reuse hotel dashboard, owner review and nightly inventory. Marketplace hotel registrations link only to a hotel owned by the current identity. Agency hotel requests quote the existing inventory; converting a request to HELD uses the same native room-reservation batch with a marketplace-row update. No duplicate inventory system.
4–5. Bus/car owner registrations, review, vehicles with presets/custom capacity, route/dates, charter quotes, blackout intervals, drivers, reservation state machine and expense/revenue reporting. Full-vehicle exclusive reservations only; seat ticketing stays disabled. Pay-at-supplier charters may be operator-confirmed as unpaid; no paid status is inferred.
6. Editable proposed monthly INR prices: agency 999, hotel 1499, bus 999, car 799; configurable resource/request limits, fixed-price subscription snapshots, dated manual activation after external commercial arrangement. Legacy agency access remains unchanged.
7. Accepted agreements snapshot the eligible net amount rule, commission rate and sharing. Only server-classified MARKETPLACE origins are eligible; direct/referral origins have zero commission. Earn on completion; tax and documented refunded net are excluded. Immutable adjustment entries reverse earnings proportionally; settlement rows record external movement, never trigger it.
8. Signed-in agency cross-booking, supplier-scoped request views, no customer data in public search. Requester agency members see only their permitted requests; supplier sees the requests they must fulfil, never unrelated CRM data.
9. Native D1 rollback/race/permissions/idempotency/ledger tests, browser flow and regression build. Local migration rehearsal before deployment checklist. Do not apply remotely or enable live finance/paid APIs as part of development.

## API contracts

- `GET /api/marketplace/public`: bounded approved-business/resource search and non-sensitive current plan pricing. No contacts, private verification material or customer records.
- `GET/POST /api/marketplace`: authenticated own dashboard and validated registration/resource/driver/blackout/agreement/request/booking transition commands. Server derives actor, supplier, origin and price; no client-provided tenant role, paid flag or commission amount.
- `GET/POST /api/admin/marketplace`: recent-MFA admin monitoring, versioned plan configuration, business review, subscription access, verified external refund/settlement records and scoped CSV reports. Never creates transfers/refunds/payment orders.
- Existing hotel APIs and callback URLs remain unchanged.

## Main risks and boundaries

Real email delivery still needs a verified sender. Hotel online confirmation remains governed by existing server-verified provider capture; sandbox completion is not a real booking. Bus/car launch uses explicit pay-at-supplier terms, not a new online payment integration. A 15-minute HELD reservation expires by effective state even if maintenance is delayed. Full-day date intervals are half-open [start,end); no hour-level vehicle scheduling promised. Drivers are checked for overlapping confirmed/held assignments. Quotes/agreements/rates use optimistic revisions and atomic guards. Provider API partners and seat inventory are future contracts, not enabled connections. Usage counters are application operations, not Cloudflare bill measurements; show configurable cost assumptions/unknown provider usage honestly. No hard Free-plan capacity guarantee.

## Implemented integration details

- `0006_verified_referrals.sql` adds independently verified bilateral supplier–agency referral relationships. Merely selecting a referral channel never waives fees. Direct origin requires the supplier owner; unknown/external API origins cannot be supplied by a client.
- Explicit activation of a linked AGENCY subscription synchronizes CRM access status/expiry in the same native batch while preserving its existing CRM capacity plan. Existing non-opted-in agencies are not touched.
- Hotel quotes, inventory changes and reservation-night inserts use grouped reads, JSON bulk writes and atomic revision/capacity guards. This avoids one read/guard/write per night. The 30-night marketplace hotel hold has an automated service query-budget test, with allowance reserved for authentication/rate limiting. Free-plan capacity still needs observed production monitoring.
- `/api/marketplace/hotel-access` restores an authenticated original booker's hotel capability into a scoped HttpOnly cookie and opens the existing checkout. Capabilities are domain-separated HMACs, never client-supplied or returned in public JSON. Rotating `BETTER_AUTH_SECRET` revokes sessions and requires an operational recovery plan for uncompleted linked holds; do not rotate it casually.
- The existing provider-verified capture batch updates a linked marketplace reservation atomically. Sandbox capture expires the B2B hold and never confirms it. No new payment provider is activated.
- `/api/marketplace/calendar` is supplier-only, month/vehicle scoped and returns reservation states, not guest contacts. CSV reports are private, date-bounded and cursor-paged. Only public proposed plan pricing uses a 60-second browser cache; availability, customers and financial records remain no-store.
- `PAID_AI_ENABLED=false` is explicit in Worker configuration. Keys alone never enable paid AI. Existing guided package/hotel responses remain usable. WhatsApp live sending and live hotel payments retain their existing disabled gates.
- Daily operation counters are not Cloudflare billing telemetry. Bounded detail lists, indexed capacity queries and per-plan quotas are implemented; no paid infrastructure, job service, seat API or settlement provider was added.
