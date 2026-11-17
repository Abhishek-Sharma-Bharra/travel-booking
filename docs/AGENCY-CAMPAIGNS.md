# Agency ad links and assisted package sales

## Agency workflow

1. In Packages, complete the selling price, itinerary, payment terms and
   cancellation terms. Internal supplier estimates remain private.
2. The enabled agency owner opens **Ad campaigns**, selects up to 12 packages,
   explicitly approves the public wording and tax rate, and sets a rate expiry
   (at the end of the selected day in the agency timezone).
3. Publish and copy the `/trips/<random-slug>` link into an ad. Example attribution:
   `?utm_source=meta&utm_medium=paid_social&utm_campaign=kerala-winter`.
4. Customers browse the published snapshot, select a package/traveller count,
   ask questions and send preferred dates/contact details with contact consent.
5. The existing CRM receives one enquiry and one **draft** quotation. Notes carry
   the request reference, campaign revision, consent purpose/time and bounded UTM
   fields. The campaign list counts submitted requests, not verified ad clicks.
6. Staff verify supplier availability, review the quotation and use the existing
   acceptance flow when appropriate. A request is never marked a paid/confirmed
   booking by the public endpoint. Customer budget is recorded as unknown (0),
   not inferred from the package total.

Published facts are immutable snapshots; editing a private package does not
silently rewrite a live offer. Pause the old link and publish a reviewed new
snapshot for price/policy changes. Pausing, expiry, disabled owner, changed owner
role or inactive subscription removes the public offer. Old submissions remain
in the CRM. No private packages are automatically published and no global hotel
marketplace has been enabled.

## AI behavior and configuration

The existing server-only `AI_API_KEY` and optional `AI_MODEL` are reused. On
Workers configure them as secrets/vars in the backend; never in Pages browser
code. API availability in the UI is configuration presence, not a provider
health guarantee. If the key is missing, consent is declined or the provider
fails, an explicitly labelled package guide remains available.

With visitor AI-processing consent, a bounded, contact-minimized text request is
sent to OpenAI to classify the intent and select an allowed package ID. Strict
schema validation rejects other fields/IDs. The model cannot generate the
customer-facing prices/policy prose, execute tools, write a booking or promise
availability. Replies are assembled server-side from the approved snapshot and
integer-paise tax calculations. Hindi/Hinglish guide text surrounds the agency's
published wording; package/policy text remains as published, without fabricated
translation. Chat history is limited to four minimized customer messages sent
with each question; chat transcripts are not persisted by this release.

## Safety and deployment

- Authenticated publish/pause require a fresh active owner, matching agency,
  same-origin request, subscription and explicit publication approval.
- Public POSTs require same origin and bounded JSON. Requests require explicit
  contact consent and international phone format, with a honeypot, per-IP and
  daily caps. This is basic abuse protection, not a substitute for a monitored
  Turnstile/WAF rollout if public-ad traffic requires stronger bot controls.
- Public responses never include internal costs, user identifiers, credentials,
  customer contacts or another agency's catalogue. No public request lookup
  exposes contact records.
- Client totals/agency IDs are rejected. Prices come from the published snapshot;
  stale campaign revisions and conflicting idempotency keys are refused.
- D1 commits the enquiry, quote, request reference and audit in one guarded batch;
  PostgreSQL uses a serializable transaction. Failed writes do not leave partial
  leads. Retry keys deduplicate exact repeated submissions.
- No online payments, room/flight holds, live availability, cancellation refunds,
  outbound messages or ad-account changes are enabled by this feature.

The two new module tables are deliberately SQL-managed and have matching
PostgreSQL/D1 migrations. They are not appended to the frozen D1 initial
migration or its generated Prisma schema. Existing native CRM records continue
using their current Prisma clients and D1 version triggers. Extend these module
migrations with additive SQL, not by editing applied migration 0001.

Before publishing, run `npm run db:migrate` against a local test PostgreSQL DB,
`npm run d1:migrate:local`, `npm test`, `npm run cloudflare:build` and
`npm run test:e2e:cloudflare` with both local preview servers running. The
Cloudflare Worker release command applies `0003_public_campaigns.sql` before
upload; publish matching Worker and Pages commits. A push to the configured
main branch triggers live staging deployments, so obtain deployment approval
before pushing a feature release there. No production/customer data export or
migration is required for this additive feature.
