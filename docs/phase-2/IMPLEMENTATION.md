# Phase 2 — workspace operations

Base: approved/live Phase 1 + security follow-up `46202e0`. Branch: `feature/workspaces-phase2-20261121`. User requested complete Phase 2 on 21 November 2026. This is **local implementation authorization, not Phase 2 production-deployment approval**. Phase 1 deployment is complete: active Pages/API and CI passed; user confirmed the new homepage is visible. The unrelated legacy Worker integration remains failed. The earlier production route-loading incident is not declared resolved.

## Scope and reuse

Retain existing agency Overview/Analytics/BI/Enquiries/Packages/Quotations/Bookings/Transactions/Marketing/assistant/team/subscription/settings workflows. Add functional customer history, versioned itinerary/costing drafts, departure calendar, supplier balances and finance/team shortcuts rather than empty pages. Existing quotation approval and branded print/PDF remain the booking path. Add an agency booking document/voucher with explicit manual-ledger provenance; pending supplier confirmation or outstanding payment produces a booking summary. Drag/drop opens a review form for eligible open CRM stages; Won still requires accepted quotation and Lost requires its reason.

Hotel workspace reuses foundation and atomic room holds, adding a navigation/dashboard, guest records, check-in/out with immutable event audit, calendar/rate views and genuine scoped revenue/booked-occupancy analytics. Check-in does not confirm inventory or payment and only accepts a confirmed real reservation. Hotel AI enquiry history/configuration remain governed by existing approval/paid-service flags.

Transport workspace preserves `/operator` (bus) and `/operator?kind=CAR` entry paths. Reuse fleet/blackout/driver/charter actions and add navigation, utilization, trip expenses/revenue/contribution views and a labeled demand baseline. No seat tickets or live payment splitting.

Basic forecast/assistant screens must be usable without paid AI: rule/seasonal-naive baselines with insufficient-history states, explicit sample/coverage limits and no validated-ML accuracy claims. Rich calibrated models and external AI tool execution remain later phases. Ground guided business answers in authorized calculations; costs must stay hidden from agents.

## Schema / migration plan

The Prisma-to-D1 generator currently verifies a frozen `0001_initial.sql`; changing Prisma models would rewrite that applied baseline. Therefore new workflow tables will be additive SQL-managed tables, as the existing marketplace already is. Do not modify migrations 0001–0006 or regenerate their definitions to introduce these tables.

- D1 `0007_workspace_operations.sql`: versioned `WorkspaceItinerary` and immutable `WorkspaceItineraryVersion`, agency/lead/package composite foreign keys, revision checks, created/updated audit metadata; `HotelGuestStay` and immutable check-in/out event journal referencing the existing stay/hotel identity. Additional narrowly scoped indexes for operational queries.
- PostgreSQL additive migration: the same itinerary/version contract using parameterized raw SQL, retaining compatibility with the existing ORM models and database-backed CI. Hotel reservation operations remain D1-only, matching the current hotel booking engine.
- No production application of these migrations in Phase 2. Local disposable migration rehearsal and backward-compatibility tests are required.
- Every itinerary write derives agency from the authenticated actor, rechecks enabled/current membership and subscription, enforces lead assignment for agents, and commits revision + immutable snapshot + activity atomically. D1 uses guarded batch; PostgreSQL uses actual transaction/row locks. Historical version data remains scoped through its current parent/lead membership.
- Hotel event writes recheck membership/identity, confirmed reservation state and current revision within one guarded batch. Idempotency keys are payload-bound. Check-in/out never marks a payment captured, frees rooms early, confirms an unreserved room, or creates settlement entries.

## API contracts

- `GET /api/workspace/operations`: private scoped itinerary list/detail/version reads, bounded pagination. No agency parameter is accepted as authority.
- `POST /api/workspace/operations`: strict create/update itinerary contracts with selected lead/package, revision/idempotency, bounded day/cost items and integer-paise calculations. Drafts do not reserve inventory or constitute booking confirmation. Estimate-based quotation content is explicitly reviewed through the existing quote workflow.
- Hotel operations extend the existing private hotel booking API with explicit read/report and check-in/out commands or a separate `/api/hotelier/operations` handler using the same membership controls; no public guest secret is returned to staff.
- Read-only customer/calendar/supplier/financial summaries derive from the existing authorized workspace snapshot, preserving agent financial redaction. Extra dashboard APIs must apply the same server scope.

## Incremental acceptance

1. Agency read models and scoped UI/navigation, real calendar/customer histories/supplier balances; keyboard alternatives for stage movement.
2. Persisted itinerary versions, deterministic costing, branded printable itinerary/proposal draft and cross-tenant/role/revision tests on PG and D1.
3. Hotel operations/event audit and dashboard/reporting with inventory/payment constraints retained.
4. Bus/car operational dashboards and baseline demand views, without changing commercial contracts or enabling paid services.
5. Consistent scoped workspace visual tokens; no public-homepage or print regressions.
6. Run generation/schema checks as appropriate, server/D1 race tests, existing/new browser journeys, accessibility/mobile and Cloudflare build. Deliver actual results and remaining limitations. Do not mark later-phase trained forecasting/automatic subscription billing as complete.


## Implementation notes (22 November 2026)

- New private APIs: `/api/workspace/operations`, `/api/hotelier/operations`, `/api/marketplace/operations`. All use authenticated scope, private/no-store responses and existing rate limits; writes require same origin. The Pages JSON guard covers the new workspace prefix.
- New SQL-managed tables are behind `WORKSPACE_OPERATIONS_ENABLED=true`. No production config flag, paid API, live merchant or commission contract is changed.
- Itineraries currently allow 100 documents per agency, 50 immutable versions each, 60 days/cost items, and a bounded 250 KB request body. These are safeguards, not a capacity promise for D1 Free. Usage/storage must be reviewed before enlarging limits or onboarding at scale.
- The explicit AI Travel Agent navigation reuses the existing reviewed enquiry assistant, manual fallback, priorities and campaign-conversation path; it does not enable a paid provider.
- A saved itinerary keeps its source package fixed for immutable history; historical metadata is derived from the selected snapshot.
- Package-assisted drafting copies the agency's own reviewed source material into an editable schedule; it does not claim generative AI created or verified a trip. Existing AI/enquiry tools remain available under their existing feature flags. Autonomous structured AI work belongs to Phase 3.
- Guided advisor answers are deterministic calculations over the authorised CRM snapshot. Seasonal baselines show 7/30/90-day counts, observed-pattern ranges and one-day retrospective MAE when history supports it. They do not implement the calibrated models or validated long-horizon accuracy planned for Phase 4.
- Hotel occupancy planning requires 70 consecutive configured past nights. Missing/invalid occupancy coverage yields unavailable, not a fabricated zero. Future occupancy percentages require explicit future allotments. Confirmed booked nights and physical guest presence remain distinct.
- Check-in requires a confirmed provider-verified reservation and the hotel-local reserved date window. Checkout can still be recorded if a profile change returns the property to review. Check-in/out never changes payment, releases nights early or confirms inventory.
- Marketplace admin cancellation/full refund is blocked while a guest stay is open, atomically against concurrent check-in. This remains enforced when the new workspace UI is subsequently disabled, and old databases lacking the new table retain their previous behavior.
- Bus/car reports use the selected owned business and server aggregates, rather than the latest-100 dashboard rows. Net booked sales exclude tax/net refunds; verified gross collections remain separate. Vehicle-day utilization uses today's active fleet and explicitly says it is not historical fleet utilization or seat occupancy.
- Bus, car and hotel marketplace entry paths select matching owned business types. Existing generic `/operator` and agency requester records remain available.
- Existing manual CRM payments, membership, subscriptions, pricing/contracts and production records are preserved. This phase does not silently convert existing commercial agreements to the future subscription-only model.
