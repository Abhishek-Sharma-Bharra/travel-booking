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


## Authentication feedback follow-up — 25 October 2026

The owner reported signup/sign-in clicks with no visible response on their Render deployment. A confirmed form UX issue was browser-native length validation preventing submit without an inline application error. The form now explicitly validates inputs, displays errors for blocked origins, rate limits and server/network failures, bounds auth requests to 30 seconds, restores its submit button, and rejects unconfirmed successful responses. Passwords are not included in fallback GET URLs. Server auth and write-origin checks also support Render's injected `RENDER_EXTERNAL_URL` when `BETTER_AUTH_URL` is absent.

Follow-up local checks passed: strict type checking, production build, all 15 unit/integration checks, and all 6 browser/API suites (the original three plus short-password feedback, empty server-error feedback, and blocked-origin feedback). Full signup, booking, logout and login still passed against the local production build. The owner's deployed authentication flow has not been independently verified: outbound access to their onrender.com host is blocked by this cloud workspace's proxy. These changes improve the verified form defects and expose any remaining deployment error; they do not establish that the reported live issue is resolved.

## Production-foundations release — 26 October 2026 (0.2)

Current local verification for this release:

- **31 unit/integration checks** passed after the hardening changes, including direct database tenant-FK attacks, fresh-role/disabled-login enforcement, exact fractional tax parsing, 500-row atomic import, payment replay, supplier credit/refund settlement, trial/seat restrictions, recipient-bound one-use invitations, shared concurrent rate limits, verification/reset/revocation, real-library authenticator/recovery-code and privileged-session flows, and encrypted-backup tamper/key rejection. Email delivery was mocked; no real client emails were sent.
- **10 Chromium browser/API tests** passed against the local production server: the existing workflow/demo/tenant suites plus recovery/reset feedback, bounded auth requests, security headers/readiness gating, dialog focus/Escape, MFA enrolment/login and denial of ordinary-owner access to operator subscription APIs.
- Strict TypeScript checking and the Next.js production build passed. Runtime `npm audit --omit=dev` reported 0 known advisories at the time checked.
- All **6 migrations** applied to an empty separate database. Revised seed produced 1,500 enquiries, 330 bookings and 1,740 ledger entries; a second seed left data unchanged. The original local seeded database also migrated without deleting its demo records.
- Encrypted custom-format backup, checksum/GCM verification and a full isolated local restore passed. Restored demo counts: 1 agency, 1,500 enquiries, 330 bookings, 1,740 ledger entries. Disposable test archives/keys and temporary databases were removed. This was **not a backup of the owner's live Render database**.
- A disposable least-privilege PostgreSQL role could read application records and was denied DDL; its permissions and role were removed after the test.
- `check:launch` deliberately reports missing live prerequisites in the development environment: HTTPS origin, actual mail delivery settings, required verification, support contact, operator allowlist/MFA and least-privilege runtime DB role. `mail:check` cannot verify a real provider without credentials. Public ready health returns 503 until configured; liveness remains separate.
- A GitHub Actions workflow is supplied; its hosted run is not claimed as verified here.

Remaining external gates and scale/browser limitations are listed in PRODUCTION.md, PRODUCTION-RELEASE.md and SECURITY-REVIEW.md. The 0.2 release is prepared for staged review; the live Render deployment was not modified by local validation. No independent security certification, monitored hosted-backup setup, real SMTP delivery, public staging migration or paid infrastructure provisioning has been completed by this task.
