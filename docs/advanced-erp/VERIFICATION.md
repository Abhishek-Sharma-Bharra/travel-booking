# Verification evidence — 27 November 2026

Baseline `7137f17`; feature branch `feature/advanced-erp-phase1-20261127`.

- `npm test`: **164 passed**, zero failures. Includes four new CRM/proposal cases: conservative equality/no mutation, tenant/agent scope, lost/segment precedence and legacy limits unchanged.
- After deferred auth initialization: `tsx --test --test-concurrency=1 tests/d1-auth.test.ts tests/email-recovery.test.ts tests/production-security.test.ts`: **19 passed**.
- After SVG title hydration correction: `tsx --test --test-concurrency=1 tests/report-chart.test.ts tests/crm-review.test.ts`: **6 passed**.
- Final `npm run cloudflare:build`: passed, including TypeScript and dry-run bundle guard; **2,935.32 / 3,072 KiB gzip**. This is the project's budget check, not verification of a live account limit. No final build-time Prisma adapter initialization errors.
- `npm run d1:schema:check`: **35 models verified**, no ORM schema change.
- `npm audit --omit=dev --json`: **0 reported production dependency vulnerabilities**. No dependencies added; this does not establish absence of application vulnerabilities.
- Full compiled local Pages → private Worker → native D1 browser suite: **23 passed (1.7m)**. Tests cover pricing proposals, saved public dark/light preference, actual signup, shared-contact review, lost filter, download, enquiry handoff, no real-plan/record mutation, anonymous/CSRF boundaries and existing CRM/hotel/transport/campaign journeys. New journey listens for JavaScript errors and now passes without hydration error suppression.
- First browser attempt: 21 passed, 2 failed. It exposed a real populated-dashboard SVG `<title>` hydration mismatch, reproduced independently in development. A single text child fixes the parser mismatch. The other failure was first-run onboarding racing the billing test's immediate navigation; test now explicitly skips/awaits the tour before navigation. No subscription safety assertion removed.
- Dark pricing screenshot exposed insufficient selector priority against legacy light styles. Scoped overrides and explicit surface/text color assertions correct this; visual review confirms dark cards and readable text. Private workspace/print scope remains independent.
- Development reproduction used fictional localhost PostgreSQL records; no production records accessed. Dependency scan used the registry; no live AI, payment, voice or sender provider called. The bundle check is dry-run only, not a deployment.

Visual artifacts (ignored): `.local/advanced-erp-review/pricing-dark.png`, `crm-mobile.png`. Browser snapshots use fictional test people/data. A mobile capture recheck waits for the existing sidebar's viewport transition to finish before screenshotting.

No migration, seed/reset, live entitlement or actual contract change. Production incident recovery, live provider compatibility, load capacity, hosted backup/restore and the full ERP brief remain unverified/pending as recorded in PHASE-1-STATUS.md.
