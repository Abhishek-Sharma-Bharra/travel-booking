# Phase 5 — official WhatsApp (staging only)

The existing manual Open in WhatsApp handoff remains unchanged. The new Messaging screen is owner-managed; managers can read, agents cannot access configuration. It supports a provider-approved template registry, explicit per-recipient opt-in/out evidence, previews from actual bookings, a bounded queue and signed delivery/STOP callbacks. Queued, accepted, sent, delivered, read and unknown outcomes are distinct. Subscription, tenant, cancellation, balance, template/channel revisions and consent are checked before sending. Ambiguous sends are not automatically retried.

## Activation prerequisites

No live messaging is authorized in this branch. `WHATSAPP_LIVE_SEND_APPROVED=false` is the default. Provisioning also requires a separate explicit operator/agency approval. Use an agency-owned WABA/phone number with the official Meta Cloud API, applicable business verification and approved templates. Check current Meta version, permissions, pricing and template policies in the provider account. App review and production authorization cannot be simulated by unit tests.

Configure server-only vault keys, META_GRAPH_VERSION, WHATSAPP_APP_SECRET and a random 32+ character WHATSAPP_WEBHOOK_VERIFY_TOKEN. Register `/api/messaging/webhook` with Meta, subscribe messages, then use the operator `npm run whatsapp:provision -- AGENCY_ID WABA_ID PHONE_ID` with WHATSAPP_ACCESS_TOKEN available only in that private process. Never paste tokens in customer-facing forms or commit them. The script verifies the phone belongs to the authorized WABA and creates a disabled channel. Owner syncs templates, maps each body parameter to actual booking fields, records documented customer consent, and reviews costs before any separate live-send approval. Dynamic media/header/button templates are unsupported and must not be used.

Templates and data are bounded; messages are limited to two per recipient per rolling 24h, with business-key deduplication. The server does not fabricate a payment link: Razorpay is deferred, so the current payment reminder contains the recorded balance only. Ledger receipts are not provider-verified payments. Consent revocation cannot undo a request already in flight to Meta.

## Verification / limitations

`tests/messaging.test.ts` exercises mocked provider provisioning, default-off send, tenant/role checks, consent requirement and STOP, deduplication, HMAC rejection, delivery ordering, and uncertain-send no-resend behavior. No real customer messages or Meta account calls are part of these tests. A process crash after provider acceptance may leave SENDING; reconcile with Meta before manually resolving it. Delivery events arriving before an acceptance ID is persisted need provider redelivery/reconciliation; there is no claim of guaranteed exactly-once external delivery. Token rotation, revocation and a real approved test-number callback must be rehearsed in staging before enabling customers.
