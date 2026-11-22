# Phase 2 — multi-workspace operations

Implemented on `feature/workspaces-phase2-20261121`, extending the approved Phase 1 code. Existing CRM, marketing, public booking, inventory and authentication flows are retained. No production deployment or production migration was performed.

## Where to review

| Workspace | Working additions / reused paths |
|---|---|
| `/workspace` | Customers and contact-linked activity history; saved/versioned itineraries; private hotel/transport costing; exact itemized draft quotations; departure calendar; supplier balances; Payments/Expenses views; Team shortcut; guided business advisor; demand baseline; explicit AI Travel Agent entry using the existing reviewed enquiry assistant and campaign conversation paths. |
| Agency Enquiries | Existing Kanban plus drag-to-review for eligible stages. Keyboard users open a card and edit its stage. Won remains tied to the existing quote acceptance workflow; Lost requires its reason. |
| Agency Bookings | Branded printable booking summary; an agency travel voucher when agency-recorded supplier confirmation and a zero recorded balance exist. The document explicitly distinguishes manual records from independently verified supplier/bank confirmations. |
| `/hotelier` | Reservation/guest dashboard, hotel-local check-in/out, guest history, booked occupancy calendar, gross provider capture report, occupancy/request planning baselines, links to room inventory, AI handoffs and hotel agency requests. Existing native atomic holds and payment callbacks remain authoritative. |
| `/operator?kind=BUS` | Bus business selection, fleet/driver/calendar/request/expense workflows, scoped full-history financial aggregates, whole-vehicle-day utilization and request demand planning. |
| `/operator?kind=CAR` | Selects the owned car business rather than whichever business happens to be newest. Same scoped fleet/charter/report controls; no live seat ticketing. |
| `/operator?kind=HOTEL` | Selects an owned hotel marketplace business, or starts the existing hotel-link registration path. This does not create a second public website. |

The SQL-backed additions require the additive migrations and private Worker flag `WORKSPACE_OPERATIONS_ENABLED=true`. That flag is **not enabled in production config**. Existing package quotation workflows remain available when the new module is off.

## AI and accounting boundaries

Package-assisted drafting uses existing agency source material and editable day notes; it does not pretend to generate or verify itineraries with an unconfigured AI provider. The existing live extraction tool remains under its existing service approvals. Advanced tool-calling/autonomous AI is Phase 3; calibrated ML and validated long-horizon models are Phase 4.

Guided business answers use authorised records. Demand and occupancy outlooks are labeled seasonal planning baselines with coverage checks, observed-pattern ranges and retrospective one-day MAE where supported. Missing history/capacity is unavailable, not zero. Recorded contribution and capture totals are not certified accounting profit or reconciled bank balances.

No new paid infrastructure, live financial transaction, subscription checkout, automatic transfer, settlement split or changed customer contract is activated.

## Documents

- [Implementation and additive schema plan](IMPLEMENTATION.md)
- [Verification results](VERIFICATION.md)
- [Deployment and rollback checklist](DEPLOYMENT.md)

Review artifacts with fictional local test data are in `.local/phase2-review/` (ignored by Git): agency/customer desktop/mobile, hotel/car dashboards, itinerary PDF and travel-document PDF.
