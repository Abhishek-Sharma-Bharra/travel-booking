# Phase 1 milestone report — 27 November 2026

This increment does **not** complete the entire Advanced ERP brief or the whole Phase 1. Audit findings and later work are in [AUDIT-AND-ROADMAP.md](./AUDIT-AND-ROADMAP.md).

## Delivered code

- Versioned public proposals: Business Starter ₹2,999/month or ₹32,999/year; AI Growth ₹5,999 or ₹64,999; AI Professional ₹9,999 or ₹1,09,999; Enterprise from ₹19,999/month, annual terms on request. Old low-price proposals removed from both public surfaces. Available capabilities separated from upcoming/provider-dependent scope. No changes to actual Agency plans, prices, limits, trials or existing agreements. Test billing stays disabled.
- CRM review centre under agency workspace navigation: exact-contact candidate review, per-enquiry segments, overdue follow-ups by agency-local date, saved lost reasons, recorded source/staff outcomes, pagination, scoped CSV exports and enquiry review. Shared households/contacts never auto-merge; no record is written by review. Current assignment and Won-stage ratios are labelled; not ML or causal employee/ad analysis.
- Locally persisted public light/dark preference on homepage and shared marketing pages. Private workspaces and printed documents keep their existing appearance. Storage denial does not block the page.
- Auth construction deferred until access within a request. This removes reproducible D1 build-time PostgreSQL-adapter/SQLite-schema initialization errors; not proof of the original production 1101 cause.
- Populated-dashboard SVG chart title hydration bug fixed by emitting one text child per SVG title. Reproduced with a fictional PostgreSQL owner in development and covered by the native D1/browser journey. No warning suppression.

## Migration and data safety

No new migration. New projections use the existing authorised workspace payload and introduce no D1 reads or external provider calls. No seed/reset, existing billing migration, commission deduction, booking/payment confirmation or paid service activation. Legacy subscription identifiers remain independent of public proposal names. Additive migrations 0001–0010 already in the repository remain intact.

## Files

Public proposals/pages: `src/lib/public-offers.ts`, `src/app/page.tsx`, `src/app/pricing/page.tsx`. Appearance: `src/components/public-site/public-appearance.tsx`, `src/app/public-appearance.css`, root stylesheet import, shared marketing wrapper. CRM: `src/lib/workspace-operations/crm-review.ts`, `src/components/crm-review.tsx`, workspace navigation. Reliability: `src/lib/auth.ts`, `src/components/report-visuals.tsx`. Tests: CRM unit suite, Advanced ERP browser flow, updated homepage price assertions, deterministic first-run tour completion in the billing browser test.

## Verification

- Complete server suite: **164 passed**, zero failures.
- After auth changes: focused D1 authentication, email recovery and production-security suite **19 passed**.
- After the SVG fix: chart and CRM focused suite **6 passed**. Development reproduction no longer reported hydration errors (a missing favicon 404 was unrelated).
- Frozen D1 ORM schema check: **35 models verified**, no schema diff.
- `npm audit --omit=dev`: **0 reported vulnerabilities** at check time; this is dependency scanning, not a penetration test.
- Final Cloudflare build/type checks pass. No D1 import-time adapter initialization errors in the final build log. Gzip budget is checked by the build script; final measurement is recorded in VERIFICATION.md.
- The first browser run exposed the SVG hydration defect and a first-run tour/navigation race in the billing test. The defect was fixed, not suppressed; the billing test now explicitly completes onboarding before navigation.

All provider/AI financial gates remain off; a local check or Git push does not verify a live Cloudflare deployment.

## Remaining implementation

Phase 1 still needs automatic lead-assignment policy, structured supplier directory/contracts/purchase orders, GST-compliant invoice/credit-note rules validated for the actual business, signed customer quotation acceptance/customer portal, branch controls, richer package price rules/multi-currency and final feature-entitlement/upgrade policy. Existing itinerary versions, supplier ledgers and reports are foundations, not substitutes for these modules.

Later phases need approved live AI pilot/budgets, consented messaging delivery and D1 ads port, telephony/voice implementation, validated chronological ML, external provider contracts/adapters, production measurement and hosted recovery rehearsal. Missing credentials alone do not account for all remaining code work.

## Required setup, costs and release checklist

No incremental third-party spend in this increment; no paid infrastructure activated. Current workload still consumes the existing Cloudflare/D1 allowances. Capacity and ongoing cost require real traffic/row-read/token measurements. Optional live AI, telephony, WhatsApp, merchant fees and paid Cloudflare services are additional and disabled until configured/approved.

Before a production release: retain current restore bookmark; build from the reviewed commit; run `npm run cloudflare:build` (includes local worker-size guard); apply only outstanding reviewed additive migrations using `npm run cloudflare:release:worker`; deploy paired Pages and private Worker from the same revision; inspect health/build identifiers and signup, populated dashboard, hotel/operator and CRM review flows. Verify billing/AI flags remain off. Do not seed production. Roll back application commits if needed; these changes require no data rollback. This report is not a production-readiness certification.

## Later operations increment — 27 November 2026

See [market pilot release](../market-pilot/RELEASE-2026-11-27.md) for the subsequent supplier directory/versioned contract records, explicit per-enquiry auto-assignment and role-read hardening. This earlier report's “no migration” and test counts apply to `c44e5de`, not the later operations release with additive migration 0011. A global campaign assignment policy, purchase orders and the other remaining items are not silently marked complete.
