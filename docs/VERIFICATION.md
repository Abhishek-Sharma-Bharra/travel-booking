# Executed verification

Verified in the cloud workspace on **24 October 2026** with Node 24.19.0, Python 3.12.14, PostgreSQL 17 and system Chromium 154. This records current-instance evidence; no public deployment, environment publication or fresh-cloud-task restoration has been performed.

| Check | Outcome | Evidence / scope |
|---|---|---|
| `bash scripts/setup.sh` | Passed | Fresh `npm ci`, local DB startup, client generation, no-op migration reapply and idempotent seed; existing configuration/data preserved |
| Fresh database preparation | Passed | Both SQL migrations applied to a separate empty database; seed created 1,500 enquiries, 330 bookings, 540 quotations and 1,740 ledger entries; second seed added no duplicates; verification database removed afterwards |
| `npm run typecheck` | Passed | Strict TypeScript check |
| `npm test` | Passed | 15 checks, 0 failures/skips; includes seven PostgreSQL integration subtests and 80 Python prediction parity fixtures |
| `npm run build` | Passed | Optimised Next.js build, TypeScript validation and route generation |
| `npm run start` | Passed | Production server started; home/demo HTTP 200 with expected content; unauthenticated data HTTP 401 |
| `npm run test:e2e` | Passed | All 3 Chromium browser/API suites passed against the production server; also passed against development mode |
| Browser demo suite | Passed | Home entry, global filters/reset, enquiry search, list/pipeline, CSV download, CSV row errors/preview, rejected demo writes, quote/report previews, model range validation and mobile navigation |
| Write-through browser suite | Passed | Agency signup, package creation, enquiry creation, quotation, booking conversion, partial receipt, balance, logout, protected-route redirect and login |
| Authenticated HTTP suite | Passed | Cross-agency receipt attack rejected; foreign agency sees no records; agent permissions enforced; CSRF origin rejected; reassigned agent sees only assigned records; disabling member revokes access |
| Print output | Passed, targeted | Generated a quotation PDF in Chromium; extracted text contains quotation, customer, total and demo label; report print preview exercised. No exhaustive cross-browser print review |
| Model training | Passed | Actual deterministic sklearn fit with 6,000 synthetic training rows and 2,000 held-out synthetic rows; metrics in `ml/evaluation.json`; all 80 coefficient-export predictions match Python within 1e-12 |
| Backup / restore | Passed locally | Custom-format dump verified and restored into a separate database; restored counts 1,500 / 330 / 1,740 for enquiries/bookings/ledger; temporary restore database removed |
| `npm audit --omit=dev` | Passed at check time | 0 known runtime vulnerabilities reported; this is not an independent security audit |
| Repository hygiene | Passed | No `.env`, database dumps, test traces, generated browser files or node_modules committed; tracked application and documentation committed locally |

## Additional server checks

Tests attempt foreign lead edits, quotation creation/acceptance, package changes, member role changes, receipt writes and access to another salesperson's assigned records. The server ignores a browser-supplied agency ID, validates active assignees and derives the agency from the authenticated database user. Tests also cover duplicate CSV rollback, invalid calendar dates, formula-safe exports, exact discounted-tax totals, quote snapshots after catalogue edits, duplicate booking acceptance, overpayments/refunds, supplier-specific balances and cancellation fees. Missing/null ML response inputs are not silently converted to zero.

## Limits and unverified work

No live hosting account/domain, production database, email-delivery service or hosted backup service was configured. There has been no independent security audit, load test, full accessibility review, Safari/Firefox/mobile-device testing, real-agency model validation, statutory tax review or production restore drill. Browser tests are targeted workflows rather than an assertion that every possible input combination works. See [feature status](FEATURES.md) and [production checklist](PRODUCTION.md).

Initial network restrictions blocked native Prisma and Playwright downloads. Prisma setup now uses the pinned npm-distributed WebAssembly engine without bypassing checksum/TLS verification; browser tests use the installed Chromium. Cloud install/startup instructions and optional documentation/native-engine network domains were saved in a configuration draft. A successful draft save does not publish the environment or deploy the app.
