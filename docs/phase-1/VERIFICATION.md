# Phase 1 verification — 10 November 2026

## Actual results

| Check | Result |
|---|---|
| Node | v24.19.0, required major 24 |
| Database safety | Local hostname checked before migrations/tests; existing development container reused |
| `npm run typecheck` | PASS |
| `npm test` | **41 passed, 0 failed**, 9.95 seconds |
| `npm run build` | PASS; new dynamic `/api/analytics` route included |
| `PLAYWRIGHT_PRODUCTION=true npm run test:e2e` | **13 passed, 0 failed**, 30.6 seconds |
| Changed TS/TSX/CSS Prettier check | PASS |
| `git diff --check` | PASS |
| Fresh disposable database migration proof | All **12** migrations applied; both invalidation triggers present; disposable DB removed |
| Render / Cloudflare / provider deployment | NOT PERFORMED |
| Real provider payments, ads sync, email or WhatsApp sends | NOT PERFORMED |

The Phase 0 baseline browser failure is fixed with an explicit historical lookup range. Its business assertion was preserved. New browser tests exercise server-filter equality, chart measures, CSV metadata/units, truthful unavailable provider/profit values, demo controls and mobile width. The HTTP workflow now explicitly logs back into the foreign owner after creating an agent fixture, so cross-agency analytics assertions use a genuinely separate agency. Agent API responses are checked for absence of supplier estimate/rate-note keys and cost values.

New KPI integration tests independently create known records and verify enquiry vs booking vs transaction periods; India/New York timestamp boundaries and preserved date-only ledger dates; current balance including receipts outside the selected cash period; cancellation fees/rates/conversion and refunds; chart/card/group totals; full-month source CPL/CAC only after attestation; invalidation on new spend/cost records; stale cost revision rejection; foreign package/booking/agent denial; fresh database role overriding a forged actor role; redacted legacy payloads; and two disjoint server pages covering 22 groups. Pure tests verify DST's 23/25-hour days, leap-month coverage, invalid dates/ranges, missing/zero values, money/ratio boundaries and nested financial redaction.

## Intermediate failures and resolution

- PrismaPg's semicolon-splitting migration helper initially rejected a PL/pgSQL body. PostgreSQL whole-script execution fixes this pinned-adapter limitation; the failed local history was preserved with the schema engine's rollback marker, existing data was not reset, and both existing-DB and fresh-DB migration paths were verified.
- Parallel test files produced an unrelated SERIALIZABLE invitation fixture conflict and cascading prerequisite failures. Test files now run sequentially, preserving explicit in-test concurrency assertions. This does not weaken the application's transaction isolation or remove checks.
- New browser selectors exposed ambiguous nested-select label matching; explicit accessible names were added. A test's reused request context had become an agent account; re-authentication to the actual foreign owner fixed the test precondition, not the tenant boundary.

Local test output is captured in `/tmp/phase1-all-tests.log`, `/tmp/phase1-build.log`, `/tmp/phase1-browser.log`; screenshots are in ignored `test-results/phase1-analytics-desktop.png` and `phase1-analytics-mobile.png`. Screens were visually inspected. These are local engineering checks, not hosted CI confirmation, a load test, independent security certification, provider approval or authorization to migrate production.
