# Phase 2 review and deployment checklist

Production deployment needs the user's separate approval. This branch has not changed production. Do not paste tokens, passwords, guest records or payment keys into logs or chat.

## Local review

1. Use Node 24, run `npm ci` and `npm run db:generate` if dependencies/generated clients are missing.
2. Use the existing local database script. Verify `DATABASE_URL` points to the disposable development database before running PostgreSQL migrations. The new integration suite creates/drops only a generated `test_p2_*` database on localhost.
3. Run `npm run db:migrate` for local PostgreSQL; run `npm run d1:migrate:local` for persisted local D1. Applied baseline migrations are unchanged.
4. `npm run typecheck`, `npm test`, `npm run d1:schema:check` and `npm run cloudflare:build`.
5. Run local Wrangler Worker with `--var WORKSPACE_OPERATIONS_ENABLED:true`; run the Pages gateway with the existing service binding and local public origin. Use only fictional records and test providers.
6. `npx playwright test --config playwright.cloudflare.config.ts`. New `workspace-operations.spec.ts` covers itinerary versions/costing/quotation, customer history, safe booking documents, finance shortcuts, planning, mobile layouts, bus/car selection and hotel check-in/out/occupancy. Local-only SQL fixtures simulate a previously verified hotel payment; real webhook verification is covered in server tests. No real payment is taken.
7. Review print PDFs for long text, customer totals, missing private costs, correct supplier/manual-payment warnings, and keyboard dialog closure after printing.

## Approved production rollout (not executed)

- Confirm the exact reviewed commit and active Pages/private Worker/D1 binding. Do not deploy the stale unrelated `travel-booking` Worker integration.
- Inspect current production errors/observability first. The earlier Next route-loading 500/1101 incident has not been proven fixed by local Phase 2 testing. Obtain the original exception text and verify the impacted routes before calling the deployment healthy.
- Take a D1 export and verify a restore in a separate database; record migration list and row counts. Preserve all existing data.
- Apply additive D1 `0007_workspace_operations.sql` with the feature disabled. For a PostgreSQL installation apply its matching additive migration instead. Do not regenerate/replace old migrations or import demo fixtures into production.
- Build and deploy the paired backend/frontend from the reviewed commit, keeping the existing public homepage, origin and service binding.
- Enable `WORKSPACE_OPERATIONS_ENABLED=true` on the private Worker only after migration success. Leave paid AI, WhatsApp, live payments and seat ticketing at their existing approval settings. No new paid infrastructure is required for this phase's rule-based operations.
- Smoke-test an isolated account through customer history, itinerary save/replay/version, exact itemized draft quotation, normal acceptance/manual ledger, hotel authorization and operator reports. Keep real inventory/payment operations under business control. Test declined cross-tenant and agent-cost access.
- Verify main routes, API JSON/content types, mobile tables, auth redirects, request failures and CPU/D1 query usage. Exercise simultaneous inventory requests using a disposable test property, not customer inventory.
- Keep polling and forecasting demand-driven; there are no new background AI calls. Review D1 rows read/written/storage and Worker requests/CPU before promising a business count. No fixed agency/hotel capacity is implied by these tests.

## Rollback

Disable the new feature flag and roll back code to the previously reviewed revision. Keep the additive tables and immutable journals; do not delete history or roll back a D1 backup over newer customer data. Active hotel guest stays still require safe checkout before cancellation/full refund. The Phase 2 admin guard remains active even with its UI disabled; a full code rollback must first assess in-house stays so the older admin flow is not used to bypass that guard.

## Explicit boundaries

Package-assisted drafts need human review. Business answers and forecasts are labeled baselines, not paid AI or certified accounting. A manual-ledger agency voucher does not independently verify external supplier inventory or bank payment. Hotel payments remain governed by the existing provider callbacks. No live seat sales, automatic transfers, settlement splits or new live financial transactions are enabled.
