# Sales and operations assistant — review release

This builds on the 0.2 security foundations, not the old deployed MVP. No production deployment, paid-plan purchase, external message or real AI request was performed during implementation.

## Run and review

Use Node from `.nvmrc`, install with `npm ci`, then run `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, `npm run build`, `npm run start`. Use the existing private development `.env` and a separate local/test PostgreSQL database. Do not point development or tests at a customer database. Migrations add fields and quote version keys; they never reset records. Seed leaves an existing demo unchanged. Keep the production release's backup, least-privilege role, email and MFA requirements.

Open the public demo using the app's Explore Demo link. Overview contains Today's priorities and owner briefing. Enquiries → Create from customer message → Load fictional preview demonstrates the exact Bali/December sample, with no invented year, dates, departure city or child count. Live AI is disabled in demo. Real agency users can review extraction, edit it, check email/phone duplicates and move into the existing enquiry form. Only final Save record writes data. Original message and the full reviewed structure persist separately from notes. Total budgets are not silently mapped to per-person budgets. Exact dates still must be resolved before saving the legacy enquiry; approximate periods remain in the reviewed extraction.

In an enquiry, the assistant shows recorded events, next action, follow-up template languages, editable copy-only drafts and internal scheduling. Completing a task remains a separate explicit Log follow-up action. Neither generation nor clipboard copying claims message delivery. Related quotation and booking IDs/statuses are shown. Package-based itinerary drafts use maintained agency itinerary text; absent text yields explicit day placeholders requiring confirmation, never invented attractions or supplier commitments. Package management now includes hotel category, itinerary, payment/cancellation terms and rate-basis notes.

Quote generation opens the existing builder for final financial input review. All calculations use integer paise on the server. Recorded selling price is the default; cost-plus markup and target margin are distinct formulas. Optional tax is explicitly entered in basis points, not inferred from destination. Snapshots preserve price, travellers, travel dates, narrative, terms, exclusions and costs. Version numbers are per enquiry, transaction-protected and uniquely indexed. Printing is disabled for a new live Draft until the user approves it. Accept & book is also an explicit final review and records reviewer/time. Customer output omits internal supplier costs, contribution and margin. Already accepted legacy quotes retain their historical snapshots.

## Optional real AI

Set server-only `AI_API_KEY` and optional `AI_MODEL` (default `gpt-4.1-mini`). The small provider adapter uses OpenAI HTTPS structured JSON output with a Zod schema; no browser key or configurable arbitrary provider URL exists. No key means a clear error and retained input. Manual entry and labelled static fictional preview work without credentials. Itinerary, follow-up and briefing use deterministic agency facts/templates and do **not** pretend to be live AI.

Input maximum: 4,000 characters; request maximum 16KB; provider deadline 20s; browser deadline 25s; no automatic retries (bounds duplicate spend). Shared database limits: 10 generations/user/hour and 50/agency/day; attempts consume quota, including failures. Auth, current agency/role, subscription and same-origin checks apply before provider work. Public demo cannot invoke the service. No unrelated database context or record ID is sent to extraction. Email/phone identifiers are removed; identity-document/payment-detail text is rejected. Text is treated as untrusted data. This is not a guarantee that arbitrary pasted personal text can be perfectly anonymised: users are explicitly instructed to omit unrelated sensitive information, and the agency must review its provider/privacy agreement before use.

Only successful generation metadata (actor, provider/model/schema and timestamp) is audited. Raw prompts/provider errors and keys are not logged. Full original customer text is retained only when the salesperson explicitly saves a reviewed enquiry. Invalid output, transport failure and missing credentials never generate a fake live response. Real provider compatibility, quality and billing need a private API key and staging validation; automated tests use mocked responses.

## Definitions and limitations

Priorities are transparent operational rules over tenant-scoped DB records, independent of synthetic model scores: unanswered New enquiries, overdue open follow-ups, open quotations older than today, positive current customer balances on recorded booking due dates, and departures within 14 days with supplier confirmation incomplete. A recorded supplier status is the current departure task; a generic checklist/task module is not implemented. Each row includes owner, reason, date and record ID and opens its permitted enquiry with related records. Filters and ten-row progressive pages avoid rendering the entire queue at once.

Owner briefing reports today's enquiry/booking creation, current attention items and open salesperson workload, with refresh time in IST and source counts. It makes no causal advertising claims. Financial overview retains separate enquiry-created, booking-created and transaction-date definitions, explained in its definition panel; it is not historical accounting.

Won/Lost enquiries have no active model badges. Historical output remains available with model/date disclosure. The model is trained on synthetic data, not validated real booking probabilities. Technical information remains secondary. No retraining on client records occurs.

Current rate model is per traveller; there is no invented room-based pricing, flight availability or supplier API. Room quantities, hotel availability, tax configuration and absent terms require salesperson/supplier confirmation. Dataset loading still retrieves permitted workspace records for existing reports; enquiry lists and the new priority queue paginate their presentation, but full server-side pagination/report aggregation remains a scaling limitation. Do not promise large-agency capacity from these tests. Existing demo data is preserved rather than reseeded destructively.

Render Free wakeup is infrastructure behaviour. The bounded loading screen offers retry but cannot remove cold starts. `/api/health/live` checks process liveness, `/api/health/ready` retains release readiness checks. Select a suitable paid hosting/database plan yourself only after staging and review; no plan was changed here. The live site was not inspected through an authenticated Render session.

## Checks

Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. No lint script exists; changed TS/TSX is checked with Prettier as well. Tests cover extraction validation/unknown values, exact markup versus margin, closed-lead queue exclusions, missing/provider-invalid AI, quote versions and terms stability after package edits, approval/task audits, tenant read/write rejection and read-only demo. Browser tests inspect fictional preview, unchanged main sales workflow and mobile sizing. This is engineering validation, not independent security certification.

### Recorded verification — 28 October 2026

- TypeScript: passed (`npm run typecheck`).
- Unit/integration suite: **36 passed, 0 failed** (`npm test`).
- Optimised Next.js production build: passed (`npm run build`).
- Chromium against the production server: **12 passed, 0 failed** (`PLAYWRIGHT_PRODUCTION=true npm run test:e2e`, 28.7 seconds).
- Prettier check on changed TS/TSX/CSS and `git diff --check`: passed.
- Inspected mobile fictional extraction and the reviewed quotation screens. Test captures are in ignored `test-results/assistant-mobile.png`, `assistant-detail.png` and `assistant-reviewed-quote.png`.
- Applied all three additive assistant migrations to local development PostgreSQL; no production database access, reset, live AI inference or customer message delivery occurred.

Browser checks include no-key error/input preservation; no record before Save; exact dates initially blank; original Hinglish message and INR 120,000 **total** budget retained; package-based deterministic INR 100,000 quote; explicit approval before print; approval retaining booking availability; and the prior signup → enquiry → quotation → booking → receipt workflow.

### Manual WhatsApp handoff

The enquiry follow-up panel includes **Open in WhatsApp** after preparing/editing a draft. Save an explicit international customer phone number (`+91` and the Indian mobile number, or another real country code; `00` international prefix is accepted). The panel displays the normalized recipient before opening. Missing/invalid numbers, empty drafts and the public demo disable the action. No country code is guessed. Clicking opens a fixed HTTPS `wa.me` URL with the encoded edited text; the user reviews and presses Send in WhatsApp. It makes no database changes and records no sent/delivered/completed event. This is not an official API integration and adds no API credentials or automated sending. The recipient and draft are handed to WhatsApp only on the user's click. No database migration is needed for this change.
