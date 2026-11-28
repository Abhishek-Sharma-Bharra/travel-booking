# Customer commerce and native connections — 28 November 2026

This release adds real D1 code paths; it does not activate provider accounts. The owner confirmed Razorpay/KYC, email sender and Meta applications are **not ready**. No live charge, external message, ad modification or paid infrastructure is authorised by that status.

## Where to find the changes

- Public Product menu: compact, two-column navigation flyout on desktop; one column on mobile. Service headings use restrained sizes.
- Agency sidebar → **Accounts & customer portal** → `/workspace/commerce`.
- Official WhatsApp text delivery → `/workspace/communications`, also linked from Messaging.
- Customer invitation destination → `/customer`. Invitation secret stays in the URL fragment until the visitor explicitly continues, is removed from browser history, and is exchanged for an HTTP-only session.
- Existing Integrations screen now dispatches native D1 Meta/Google OAuth, account selection and bounded read-only spend snapshots. Native activation remains disabled.
- Agency and supplier assistant forms have opt-in browser voice dictation. This is not an inbound phone-call agent.

## Database and implementation sequence

Three additive native D1 migrations:

1. `0012_customer_commerce.sql`: immutable tax documents, atomic per-agency/India-financial-year numbering, one-use invitations/sessions, payment checkout/refund records.
2. `0013_native_ads.sql`: hashed OAuth state, encrypted credentials, selected business accounts and complete daily read-only snapshots.
3. `0014_native_whatsapp.sql`: encrypted official business-number connection, consent history and durable outbox with uncertain-send states.

Existing CRM/Hotel/Marketplace records are retained. No schema reset, demo seed, existing plan repricing or automatic inventory confirmation. The existing release-worker script must capture the restore bookmark and apply pending migrations before deploying the Worker; Pages uses the same commit's generated assets. Rollback application code without deleting issued documents or financial records.

## GST documents

Owners/managers review supplier GSTIN/checksum, party addresses/state codes, place of supply, service SAC, eligible taxable amount, explicit GST rate and treatment rationale. Exact integer-paise calculations split intra-state CGST/SGST or interstate IGST. Issued snapshots and numbering are immutable; corrections use linked credit notes. Atomic guards cap net invoicing at maintained booking value and cap credit-note taxable/tax components at the original invoice. A document/credit note does not initiate a payment/refund.

The agency/accountant must decide applicable tour-operator, margin, concessional, export and special tax rules. Government IRN/e-invoice submission, e-way bills, GST filing and general tax advice are **not** implemented by this engine. Do not describe a printable PDF as an IRN-registered invoice. Annual statutory requirements and mandatory invoice particulars need commercial review before launch.

## Private customer portal

Only the maintained booking email can receive a 24-hour one-use invitation. It becomes a 24-hour scoped session; email changes and agency revocation invalidate access immediately. The projection includes only that booking's agreed quotation snapshot, status, recorded customer balances and issued documents. Supplier cost, other customers, internal lead notes and staff credentials are excluded. Expired agency subscriptions retain document access and revocation capability, while new document issuance stays blocked.

This is booking-invitation authentication, not a customer password account or a full pre-booking online quotation-acceptance system. Signed quotation acceptance before booking remains separate future work.

## Customer booking payments

`COMMERCE_PAYMENTS_ENABLED=false` and `COMMERCE_LIVE_PAYMENTS_APPROVED=false` in source-controlled Worker config. `COMMERCE_MERCHANTS_JSON` is a **server secret** containing at most ten explicitly approved agency-owned merchant entries (`agencyId`, `mode`, `keyId`, `secret`, `webhookSecret`, `contractVersion`, `approved`). Never put its value in public configuration, source control or support chat.

- Amount comes from the backend booking balance. No cross-business collection, platform commission deduction, payment splitting or inventory confirmation.
- Orders are persisted before the network request. Ambiguous creation becomes UNKNOWN and cannot create a second order. An authorised owner/manager can reconcile a provider order reference; its receipt, amount, currency and agency/booking metadata must match. READY orders resume the same checkout.
- Browser success is only a verification prompt. Signed webhooks plus independent provider reads verify captures/refunds. A test capture never becomes a real CRM receipt. Isolated mocked LIVE tests exercise one-time ledger writes; they are not real money transactions.
- Cancelled/stale/late/partially refunded payments go to REVIEW rather than inventing a confirmation. Refund callbacks record verified refunds; they do not initiate refunds. Existing manual refund ambiguity also requires review.
- Webhook: `/api/commerce/payments/<agencyId>`; provider events `payment.captured` and `refund.processed`. Test duplicates, lost acknowledgements, wrong modes, cancelled bookings and refund replays before any separately approved live pilot.
- Do not rotate/remove merchant credentials while checkouts or callbacks require reconciliation.

Platform SaaS subscriptions remain the existing **test-only** billing sandbox. This customer booking-payment module does not implement live SaaS recurring renewal/entitlement reconciliation. Final commercial/tax/refund terms and an additional live-subscription implementation are still required.

## Meta/Google ads on D1

`NATIVE_ADS_ENABLED=false` by default. Register/approve the provider app, configure the existing Meta/Google credentials/API versions and encryption key ring, and use the fixed callbacks `/api/integrations/meta/callback` and `/api/integrations/google/callback`. OAuth state is owner-bound, hashed, short-lived and consumed atomically; Google uses PKCE. Account selection is revalidated against the provider.

Sync is read-only and owner-triggered, up to seven daily snapshots, three pages/600 facts per day in the reviewed pilot. All pages/days must finish before the batch replaces any facts. Large accounts fail explicitly while previous complete reports remain. Currency/timezone and provider conversion definitions stay separate; no currency conversion or claim that ad conversions equal CRM bookings. No automatic background sync is enabled by this increment.

## Official WhatsApp on D1

Requires the approved Meta app/WABA/number, encryption key ring and reviewed `WHATSAPP_PROVISION_APPROVED` / `WHATSAPP_LIVE_SEND_APPROVED` settings. Only an authorised owner connects a token; it is stored encrypted and never returned by overview/preview endpoints. Provider phone ownership is checked. Approved plain-text UTILITY/MARKETING templates are supported; media/button templates and bulk campaign automation are not.

Record purpose-specific opt-in evidence for the booking's current international phone. The preview resolves only permitted backend facts. Sending rechecks role, phone, consent, channel revision and a bounded 50-message/day pilot quota. Request replay cannot resend; an unresolved SENDING/UNKNOWN message blocks another equivalent send. Signed provider delivery callbacks can reconcile unknown acknowledgement using the opaque outbox reference; READ never downgrades to DELIVERED/FAILED.

Webhook: `/api/communications/webhook`; verify-token handshake uses `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, raw-body signatures use `META_APP_SECRET`. Do not paste tokens into chat. Existing legacy messaging/automation queues are not silently redirected to this new explicit-review text-delivery flow.

## Voice boundaries

Browser dictation requires explicit opt-in, a supported browser and microphone permission. The browser may use an external speech service. It creates a draft; it does not submit a command or confirm financial actions. Typing stays available. No inbound telephony number, automated call handler, recordings, voice billing or unattended voice booking has been activated/implemented.

## Actual laptop actions before live activation

1. Finish Razorpay merchant account/KYC and test configuration, including whose merchant account receives each business's money. Finalise contracts, tax/refund terms and agency authorisation.
2. Verify an owned email sending domain and configure server-side `RESEND_API_KEY` + `MAIL_FROM`; test invitation delivery, expiry, reset and revocation.
3. Create/approve Meta business/apps/WABA and Google OAuth/Ads developer project as applicable; register exact HTTPS callbacks. Set provider credentials/encryption keys securely on the backend.
4. Test one explicitly approved business per provider. Source-controlled activation flags need a reviewed config release; dashboard-only changes can be replaced by the next Git deployment.
5. If inbound AI calls are required, choose a telephony/speech provider, consent/handoff policy and budget. That module needs further implementation, not merely an API key.

No provider key/account being absent is worked around with fake live success.
