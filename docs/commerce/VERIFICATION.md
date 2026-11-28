# Verification

Targeted native D1 tests cover exact GST/state calculations and financial-year boundaries, immutable/idempotent invoice creation, atomic last-invoice races, component-capped credit notes, one-use portal sessions, private projections, email-change/revocation, captured versus test payments, late/cancelled capture review, provider refunds, uncertain-order reconciliation, expired-subscription read/revoke behavior, OAuth/account scope, complete spend snapshots, opt-in/template facts, signed/monotonic WhatsApp delivery and uncertain-send deduplication.

Provider transport is mocked in financial/messaging tests. No real payment, WhatsApp send or paid provider service is used. Native migrations are rehearsed on temporary/local D1 databases; production completion requires independent Cloudflare release evidence.

Exact final results are appended after browser/build checks.

## Final backend and build evidence

- Full server suite: **193 / 193 passed**. After the final relationship checks, all **11 commerce security/atomicity tests** passed again. The gateway suite, including the additional native WhatsApp text-challenge/JSON failure regression, passed **16 / 16**. Counts overlap; they are not summed into an invented total.
- TypeScript passed. Native D1 schema check passed for 35 existing Prisma models; custom additive commerce/connection tables were independently exercised by migration-backed tests.
- Production dependency audit: **0 known vulnerabilities**. No dependency was added.
- Final Cloudflare/OpenNext build passed. Worker gzip: **3038.04 / 3072 KiB**, below the Free Plan bundle ceiling. This does not establish production CPU capacity or error-free operation.
- Bounded local GET smoke: **14 / 14**, concurrency four, no failures. Not a load-capacity/latency SLA.
- Test database migrations 0012–0014 preserve the existing CRM schema/data; only local persisted D1 and temporary test databases were mutated.

## Visual and browser review

Reviewed actual compiled screenshots of the compact Product menu and issued tax document. Exported the fictional invoice to PDF, inspected it, and verified one A4 page with no extra blank page. Customer invitation tests exchange the token into an HTTP-only/SameSite Strict cookie, remove it from browser history, display only the scoped booking, and invalidate access on logout.

Regression checks identified and fixed same-document invitation hash navigation and blank PDF pagination. Initial concurrent browser runs conflicted in shared artifact directories/local signup buckets; final verification is serial with distinct fictional test IPs, without reducing production rate limits. A legacy ads-availability copy assertion was updated to reflect the implemented native path while disabled/configuration checks stayed intact. Local services must report health 200 before browser runs; a startup binding race is not treated as a completed application test.

No real email/payment/message was sent. Provider I/O in financial/messaging server tests uses explicit fictional transports. Production website access is still blocked by proxy CONNECT 403; local checks and GitHub CI are not Cloudflare deployment-completion evidence.

Final serial Cloudflare browser suite: **31 / 31 passed (2.0 minutes)** on the final compiled artifact, including the real portal cookie exchange and one-page invoice PDF assertion. Screenshots/PDF are retained under `.local/commerce-release-review` and contain fictional data only.
