# Public launch polish — 28 November 2026

## Changes

- One root theme controller persists light/dark across marketing, authentication and business workspaces. Dark AI pseudo-layer, dashboard metric/pipeline/priority surfaces, forms and tour highlight receive explicit dark colours. Print media remains paper-friendly.
- Product, Features, Solutions, AI Intelligence, Pricing, Demo and Contact open keyboard-accessible native dialogs; detailed links still navigate. Layout coverage includes mobile/tablet/desktop.
- Public WhatsApp click-to-chat uses the owner's authorised +91 97179 56828 contact; no message is sent automatically. Agency public trip and hotel detail journeys retain their business contacts.
- Proposed monthly agency catalogue is ₹2,499 / ₹4,999 / ₹8,999 / ₹14,999 + applicable GST. Annual pricing is on request; existing agreements/capacity and live billing are not changed.
- PLATFORM_OWNER_EMAIL supplements existing administrator entries. Verified identity, enabled MFA and a fresh MFA session are still required for platform totals/actions. /admin/setup exposes only the owner's setup status; ordinary users cannot access counts.
- /api/health/live adds a public Git release identifier, without configuration or secret disclosure.

## Data and activation

No schema migration or production data operation in this increment. No paid AI, payments, messaging, ads, voice or infrastructure activated. Root marketing popups accurately distinguish working tools from setup/upcoming modules.

Full live recurring billing/entitlement reconciliation, statutory GST invoicing, authenticated customer acceptance/portal, inbound voice and remaining native D1 messaging/advertising integrations are not completed by this increment. Provider credentials alone do not implement these remaining modules. See LAPTOP-SETUP-HI.md and WORKFLOW-COMPARISON.md.

## Validation

Verification results and release evidence are appended after final checks. Production origin and competitor requests are blocked by the environment's proxy (CONNECT 403); local verification does not establish production health or Cloudflare deployment success.

- Server suite: 182 cases exercised. The first resumed run passed 179 and failed three PostgreSQL cases because the local container had not yet restarted. Starting the existing local database and rerunning those three cases (plus the campaign D1 case) passed all four; no test assertion was removed.
- Cloudflare browser suite: 28/28 passed. After visual review exposed additional dashboard white surfaces, four relevant agency/public-launch tests passed again with explicit dark card/pipeline/priority background assertions. Final empty-lane styling is also asserted.
- TypeScript check passed. Cloudflare/OpenNext production build and the Free Plan gzip budget check passed; final exact bundle size is recorded below.
- D1 schema check passed (no schema changes). Dependency audit: zero known production dependency vulnerabilities.
- Bounded local smoke: all 14 GET requests passed, concurrency four. This is not a production capacity/CPU test or latency guarantee.
- Screenshots reviewed for AI pseudo-background contrast and dashboard card contrast; review artifacts under .local/public-launch-review (not production data).

Final Cloudflare bundle: **2963.03 / 3072 KiB gzip**, passed. No provider deployment performed by the build command itself.

Final compiled artifact: all three public-launch regression cases passed again, including empty-lane background contrast, theme persistence, dialog keyboard/focus behavior and ordinary-owner admin denial.
