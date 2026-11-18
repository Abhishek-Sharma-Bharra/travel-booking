# Hotel inventory, guest guide and provisional room holds

## Audit and release boundary — 18 November 2026

The existing Hotel/HotelMember/HotelRoomCategory/HotelAuditEntry foundation had
PostgreSQL row-lock transactions and deliberately refused D1. It supported owner
registration, verified identity, room categories and independent operator review,
but no date inventory, public booking page, payments or hotel AI chat.

This additive release ports those hotel-management writes to guarded native D1
batches, retaining the PostgreSQL foundation. It adds a separate hotel-owner
inventory/request dashboard and approved-property public pages. Agency CRM,
packages, leads, receipts, subscriptions and reports are not repurposed or removed.

**This is a gated implementation, not a live hotel marketplace.** Customers can
review backend quotes and explicitly create/release a 15-minute room hold.
Hotel-specific Razorpay orders, hosted checkout, captured-payment verification,
signed/idempotent webhooks and owner reconciliation are implemented. Sandbox
payments produce SANDBOX_COMPLETED, never real hotel bookings or CRM receipts.
Live confirmation is available only after a separately approved live-money gate,
owner MFA and provider acceptance. No real provider transaction has been tested.

## Architecture and contracts

- `/hotelier`: existing verified-user login and hotel membership remain separate
  from agency tenancy. Current shared signup also creates an agency workspace;
  a dedicated hotel-only signup is not introduced. All hotel access requires a
  verified, enabled account. Owner/manager membership is rechecked in the native
  mutation batch. Contact and photo URLs retain existing validation/host rules.
- `/admin/hotels`: business review uses the existing allowlisted operator,
  verified email and recent MFA session; operators cannot review their own hotel.
  Registration/profile/category changes return a hotel to draft for review.
- `/stays` and `/stays/[hotelId]`: only approved hotels and active room categories
  are public. Dates, guests, occupancy, nightly allotment, blackout and minimum
  stay are validated. Missing nightly rates mean unavailable, never a default.
- `GET/POST /api/hotelier/booking`: scoped inventory and guest requests/chat.
  Inventory updates accept 1–30 nights, integer paise, actual room allotment,
  minimum stay, blackout and explicit approval. Future daily allotments cannot
  exceed physical room count or drop below existing active commitments.
- `GET/POST /api/public/hotels/[hotelId]`: public hotel, quote, saved status, chat,
  explicit hold and explicit release. Same-origin POST, bounded body and server
  rate limiting apply. Session/request capabilities are HttpOnly/SameSite cookies
  with secure HTTPS; secrets are hashed in D1 and never sent as JSON.

New SQL-managed D1 tables are `HotelRoomNight`, `HotelStayRequest`,
`HotelStayNight`, `HotelChatSession`, `HotelAiUsage`, `HotelMerchant`,
`HotelPaymentAttempt` and `HotelPaymentEvent`. Migration
`0004_hotel_booking_core.sql` is additive. The existing frozen Prisma/D1 schema
and historical migrations are preserved. New booking features are D1-only;
existing PostgreSQL hotel management remains available.

Quote prices use exact integer paise and rounded tax. The quote version binds
approved hotel/room revisions, dates, occupancy and every night's rate. A hold
rechecks the version and capacity in one guarded batch. Night allocations,
request, immutable policy/price snapshot and audit insert commit together.
Concurrent last-room requests cannot both commit. A hold expires after 15 minutes
without depending on a cron to release capacity. Explicit release is scoped and
atomic. Expired/cancelled holds never count as confirmed bookings or revenue.

The owner must maintain a dedicated TravelOS allotment or synchronize with the
real PMS/channel manager. Atomic D1 reservations protect TravelOS inventory only;
they cannot prevent a walk-in/OTA selling the same physical room elsewhere.

## Cloudflare AI Gateway

Gateway is a useful optional proxy for provider observability/routing. It is not
the inventory engine, PMS, payment gateway or booking authority. Configure a
provider-supported OpenAI structured-output model and a real provider account.
Gateway does not replace provider API billing/authorization.

Server-only configuration:

- `HOTEL_AI_API_KEY` (or the existing `AI_API_KEY` fallback)
- `HOTEL_AI_MODEL` (default gpt-4.1-mini; verify provider availability/prices)
- `HOTEL_AI_GATEWAY_BASE_URL` with the exact trusted form
  `https://gateway.ai.cloudflare.com/v1/<32-hex-account-id>/<gateway-id>/openai`
- `HOTEL_AI_GATEWAY_TOKEN` if the Gateway requires authentication

Without a Gateway base the configured key calls OpenAI directly. Arbitrary hosts,
query strings and paths are rejected. The Gateway request uses provider Bearer
credentials, optional `cf-aig-authorization`, and skips Gateway response caching
because personalized availability must not come from a cache. Configure Gateway
logging/privacy/retention before activation; do not assume provider-side logging
is disabled. Never put these secrets in Pages/NEXT_PUBLIC variables or chat.

The AI implementation in this stage **classifies guest intent**, with bounded
server-owned history; it does not freely generate financial/policy facts. Prices,
room descriptions, hotel policies, availability and confirmations come exclusively
from backend records. Hindi/English/Hinglish guidance and consented conversation
storage are supported. This is not yet a full open-ended hotel sales agent.
The no-key/no-consent path is visibly a hotel guide/human support, not a fake AI
response. Staff can view saved handoffs; automated outbound messages/staff replies
are not introduced by this release.

Before a provider attempt, native D1 guards reserve a call against 100 attempts
per hotel/UTC day and 1,000 global attempts/day. Failures also consume attempts.
These are request ceilings, not a guaranteed currency budget or exact token/cost
ledger. Set provider spending limits and review Gateway usage/costs before live
AI access. A separate subscription/quota model for hotels remains to be decided.

Chat storage requires consent; AI processing requires additional consent. Guest
contact fields stay outside provider messages. Chat history is capped, expires
in seven days, and is redacted on subsequent access or bounded 15-minute cron.
Expired chats become inaccessible immediately. Operational guest requests/audit
and policy snapshots have separate retention; they are not erased with chat.

## Safe rollout

Both flags default false in the committed Worker configuration:

    HOTELS_ENABLED=false
    HOTEL_BOOKING_ENABLED=false

No production migration or deployment is authorized/executed by this implementation.
Before enabling the first-stage hold flow:

1. Export/back up D1 in a private encrypted location and rehearse restore into a
   disposable database. Verify the account's actual Time Travel retention.
2. In a test environment, apply the additive D1 migration before uploading code.
   Existing release-worker tooling applies migrations before upload.
3. Keep Pages and Worker on the same commit, with canonical origin and existing
   Better Auth secret/bindings preserved. Configure verification-email delivery,
   the independent platform operator/MFA and approved photo hosts.
4. Enable the hotel flags only for approved pilot properties. Have hotel staff
   enter dedicated room allotments/rates. Test identity, owner access, operator
   review, public quotes, simultaneous holds, release, expiry and handoff.
5. Test Gateway/provider processing with explicit AI consent and private keys.
   Inspect actual Gateway logging, response usage, costs and rate limits.
6. Obtain separate approval before any production migration/deployment. Enabling
   holds does not enable payment or confirmed-booking functionality.

## Hotel-specific payment setup and safeguards

The hotel owner connects its own authorized Razorpay merchant in the hotel
inventory/request console. Credentials and webhook signing secret use the
existing independent AES-256-GCM vault. Configure
INTEGRATION_ENCRYPTION_KEYS/INTEGRATION_ACTIVE_KEY privately in Workers; never
reuse the auth secret. Public hosted checkout receives only the Razorpay key ID.
No card data is stored by TravelOS. TravelOS commission is zero, provider fees
and SaaS subscriptions remain separate. Razorpay Route is not assumed or used.

The console displays the exact /api/payments/hotels/<merchant-id> webhook path.
Subscribe to payment.captured and payment.failed. A checkout signature alone is
not enough: backend GET payment verification must match captured status, order,
amount, currency and hotel request. Every financial state transition and booking
confirmation is a native guarded batch. Event IDs/body hashes deduplicate retries;
a failed event never downgrades captured payment. Confirming a live stay checks
that the exact hold is still valid at COMMIT time, not just before a provider call.

HOTEL_LIVE_PAYMENTS_APPROVED defaults false. Connecting a live merchant also
requires a verified hotel OWNER with recent server-proven MFA. A TEST payment
never creates a real stay, agency Booking or Transaction. Captured payment after
hold expiry/cancellation, hotel suspension or live-gate shutdown goes to
REFUND_REVIEW without consuming newly available inventory or falsely confirming.

One durable order intent exists per stay. A timeout/5xx/malformed response never
blindly posts another order: mark RECONCILIATION_REQUIRED and have the owner match
an existing Razorpay order ID/receipt/amount through the reconciliation form.
A definitive rejected order with no provider order can recover after owner
credential correction. Merchant-account/key rotation is blocked once any uncertain,
pending or completed order exists, until operator-reviewed key history and
reconciliation are available. Do not delete payment attempts to bypass it.

Current blockers: the real Razorpay TEST account and AI/Gateway credentials were
not ready in the user's earlier setup. Real checkout/webhook and multilingual
provider acceptance still need privately configured credentials. Production data
has not been migrated and all hotel/live-money flags remain off. Refunds,
chargebacks/settlements, invoice/voucher export, outbound notifications, PMS/channel
synchronization, operational reconciliation and hotel subscription billing need
explicit operational ownership/further implementation before unrestricted live
sales. The agent remains an AI-assisted guided flow, not an unrestricted agent.

## Rollback

Before any live payments, roll application code back with both hotel flags off.
Once live orders exist, retain webhook/reconciliation ingestion and disable new
live checkout via the live-money gate; use a forward fix rather than rolling
back past payment handlers or disabling all hotel APIs.
Keep additive tables and guest/audit records; do not DROP them or reset D1. Do
not restore the whole database merely to revert the UI. Any database Time Travel
restore is a separate approved incident procedure because it rewinds CRM data.

## Creating an AI Gateway

Cloudflare dashboard -> AI -> AI Gateway -> create a gateway for TravelOS hotels.
Use the account ID/gateway ID to form the trusted OpenAI base URL above. Enable
Gateway authentication if required and save its token in Workers secrets. Configure
privacy/retention, inspect actual request/token costs and set appropriate provider
spend limits before enabling customer AI. Gateway caching must remain skipped for
personalized room availability. A Gateway alone cannot supply a provider key,
supplier availability, a payment account or permission to confirm a booking.

## Verification results

- Complete server suite: 112 passed; existing CRM, PostgreSQL hotel foundation
  and native D1 hotel tests included. Ten hotel D1 tests cover verified identity,
  tenant/hotel isolation, exact prices/taxes, simultaneous last-room holds,
  stale quotes, rollback after an injected database failure, expiry/release,
  chat consent/history/retention, Gateway endpoint/auth/cache headers/quotas,
  sandbox capture, signed webhook retries/failure ordering, live-mode contracts,
  late captures, uncertain order reconciliation and credential correction.
- The payment/live-mode and Gateway HTTP contracts use fictional credentials and
  mocked responses in isolated databases. No actual hotel, money or provider
  account was used. Real sandbox and real provider acceptance remain pending.
- Local Pages -> private workerd -> D1 browser suite: four passed, covering prior
  campaign/CRM/demo flows and the new hotel owner/ad guest flow. The hotel flow
  was rerun after final styling/chat-resume changes and passed. Screenshots show
  fictional local fixtures, not a live approved property.
- Type checking, Cloudflare build, Wrangler packaging dry-run and frozen D1 schema
  check passed. Local scheduled-handler smoke test returned successfully. Only
  the local test D1 received the migration; production data was not touched.

A scoped guest capability is currently retained in the browser for seven days;
hotel staff must handle later identity-based booking recovery. Refunds and
chargebacks require hotel/provider operational handling. Do not launch
unrestricted real sales before those support/recovery procedures are reviewed.
