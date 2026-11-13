# Hotel marketplace — repository audit and staged architecture

Audit date: 13 November 2026. Existing application: Vashisht TravelOS, Render/Node, same repository and PostgreSQL. This is an additive project, not a replacement CRM. No production database access or deployment is authorized for this work.

## Evidence from the existing repository

- Next.js 16.4.3 App Router, React 19.2.4, TypeScript, Node 24; server routes and pg require the existing Node runtime. Prisma 7.10.1 with PostgreSQL adapter. Eighteen SQL migrations existed at audit start.
- `prisma/schema.prisma`: Agency, User, Session, Account, Lead, Package, Quote, Booking, Transaction, activity/reporting/integration/messaging/automation tables. Package `hotelCategory` is descriptive text, not hotel inventory. Existing CRM Booking is a travel-agency sales record, not a hotel reservation.
- `src/lib/auth.ts`: Better Auth, email/password, optional required email verification, TOTP/recovery codes and database rate limits. Signup currently creates an Agency; hotel-owner membership must be independent of agency role. Do not trust the OWNER string as a platform-admin or hotel-owner permission.
- `src/lib/session.ts`, `access.ts`, `actions.ts`: agency scoping, fresh users and AGENT assignment filters. Existing agency IDs and composite FKs must remain unchanged.
- `operator-access.ts`: verified allowlisted administrator, enabled MFA and fresh session proof (four hours). Reuse this for hotel review; ordinary agency owners cannot approve hotels.
- `ai-provider.ts`: optional OpenAI structured enquiry extraction with minimization, validation, timeouts and rate limits. It does not search inventory, quote hotels, converse autonomously or confirm bookings. Existing synthetic lead scores are not hotel recommendations.
- Razorpay: no installed payment SDK, order creation, payment verification or Razorpay webhook handler. Messaging/automation explicitly state it is deferred. Existing ledger receipts are manually recorded, not verified gateway collections. WhatsApp raw-body HMAC/idempotency code is a useful pattern, not a Razorpay integration.
- `integrations/vault.ts`: AES-256-GCM with contextual AAD and key versioning. Reuse for approved merchant/AI credentials, never return plaintext keys.
- `rate-limit.ts`, `http.ts`: shared PostgreSQL rate buckets, private/no-store headers, same-origin mutation checks and bounded JSON/raw bodies. Reuse these rather than adding an independent auth stack.
- Existing browser coverage: authentication/MFA, enquiry→quotation→booking, BI, KPIs, security, integrations/demo safety, tour and SEO. Existing unit/integration coverage also checks subscriptions, cross-agency access, finance, queues, signed messaging events and backups. Baseline from the preceding UI release: 58 server tests and 22 browser tests.
- `.github/workflows`: PostgreSQL CI, client generation, migration rehearsal, tests, production build, browser tests and dependency audit. Render service configuration/credentials are not available here; actual live revision cannot be independently verified. Cloudflare artifacts are not the chosen deployment target.

## Architecture and boundaries

Use the current application as a modular monolith. Separate hotel domain tables and services from CRM tables. HotelMember(userId, hotelId, role) is the authorization boundary, independent of Agency and User.role. A user may own multiple properties; an agency employee acquires no hotel access automatically. Platform review is a separately verified operator permission.

Public search reads only approved hotels and approved catalogue fields. Customer PII, conversations, merchant credentials and operator notes never belong in public search responses. Quotes/reservations later capture hotel/room/policy/tax/currency/price versions so later profile changes cannot rewrite existing contracts. New hotel-domain records do not automatically become CRM bookings or count toward CRM revenue.

Keep money in integer minor units with explicit currency (initial scope INR). Taxes need a business-reviewed configuration; no assumed GST rate. Hotel-local calendar nights use [check-in, check-out), with an explicit IANA timezone and no server-midnight assumptions. Reporting, commission, collections and recognized revenue have different definitions.

## Implementation sequence and gates

1. **Foundation / Module 1:** additive Hotel, HotelMember, HotelRoomCategory and HotelAuditEntry; authenticated owner console; editable draft profile and room categories; submit, reject, approve, suspend; verified-email owners and MFA operators. Feature off by default. Existing login reused; new signup still creates the existing agency until an explicitly designed account-onboarding split is implemented. Photo URLs are administrator-allowlisted HTTPS references, not a completed upload/media pipeline. No bookings/payment buttons.
2. **Inventory / Module 2:** HotelNight and RatePlan/RateRule versions, owner calendar, blackout/minimum-stay validation, audit records. Hotel inventory is manual by default pending source-of-truth clarification; PMS/channel-manager integration needs provider contracts. Never promise global double-booking prevention without external synchronization.
3. **Reservation core / Modules 3 and 5:** search/detail pages, immutable server quotes, expiring holds, contact consent and reservation lifecycle. Every night in the interval must exist with capacity; missing nights mean unavailable, not unlimited stock. Lock room/date rows in a stable order in one PostgreSQL transaction, recheck active holds and confirmed allocations, then reserve all nights or none. Add DB constraints and concurrent tests. Browsers/LLMs cannot supply trusted final prices or payment statuses.
4. **Payments / Module 6:** choose an approved merchant authorization model, test-mode credentials and webhooks, then verified confirmation/vouchers, refunds, reconciliation and commission ledger. Do not assume Razorpay Route/OAuth/partner status. Customer funds must settle to the hotel's authorized merchant account. If split payouts are unsupported, hotel-direct collection plus separately invoiced commission is an option to approve, not a silent platform-bank fallback. Route eligibility, commission tax/accounting and payout responsibilities require provider/business confirmation.
5. **AI / Module 4:** Hindi/English/Hinglish conversational extraction and read-only allowlisted search/quote tools; structured output validation, prompt/data separation, consent, retention, human handoff and provider usage records. Recommend only live backend matches. Checkout requires explicit customer confirmation and fresh server validation. No direct SQL, credential access or LLM-generated prices/availability/booking confirmation. Approved policies only; unknown data stays unavailable.
6. **Operations / Modules 7–9:** property calendar/bookings/conversations, occupancy and ledger reports, disputes, cost reporting, notifications, queue monitoring and RBAC. Existing agency automation cannot send hotel messages without hotel-scoped authorization and consent. Security, provider sandbox, rollback and staging acceptance gates precede production approval.

## Planned additive migrations

First implemented migration adds only Hotel/HotelMember/HotelRoomCategory/HotelAuditEntry plus User relations. No CRM data is copied, deleted or reinterpreted.

Later migrations, reviewed separately: HotelNight(unique hotel/room/date and nonnegative capacity), HotelRatePlan/Rule, HotelQuote/QuoteNight, HotelHold/HoldNight, HotelReservation/ReservationNight, HotelGuestConsent, HotelPaymentAttempt, HotelWebhookEvent(unique merchant+providerEventId with payload hash), HotelRefund/Settlement, HotelCommissionEntry, HotelConversation/Message/Handoff, HotelAIUsage and HotelOutboxJob. All child resources carry hotelId and composite FKs where appropriate. No speculative future tables should be treated as implemented.

Webhook processing: authenticate the raw bytes before parsing, resolve merchant server-side, durably deduplicate events and store hashes, validate booking/order/currency/amount/capture state and atomically transition reservation+ledger+outbox. Browser success callbacks alone never confirm. Late capture after hold expiry needs reallocation or a reviewed compensating-refund state, not overselling. External refunds/payouts require an outbox/saga and reconciliation; database rollback cannot undo a provider call. Settlement events do not imply booking revenue.

## Principal risks

- Render Free sleep is unsuitable for reliable checkout/webhooks/workers; production requires monitored always-on capacity and a reliable scheduler.
- Existing auth signup creates an agency, and hotel email verification needs working transactional email. Hotel-owner UX must disclose this compatibility stage.
- Real business verification, media ownership/moderation, cancellation legality, tax handling, disputes, privacy retention, chargebacks, inventory source and merchant authorization need concrete operating procedures.
- Existing API error helpers can expose arbitrary error.message; new hotel routes must sanitize unexpected errors and validate Zod failures explicitly.
- Append-only operational audit permissions, load testing, backup restore rehearsal and external penetration/security review remain release gates. No claim of full production readiness follows from local tests.

## Delivery state

Audit and contracts precede code. Current implementation is an incremental foundation, not the completed nine-module marketplace. Follow SETUP.md and API-CONTRACTS.md for the actual implemented surface and future contracts.
