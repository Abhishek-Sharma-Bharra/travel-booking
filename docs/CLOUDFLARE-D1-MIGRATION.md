# Cloudflare D1 migration status

The selected target is Cloudflare Pages + a private Worker + Cloudflare D1.
Render remains separate, with auto-deploy off. No real Render records, accounts,
passwords or provider credentials have been copied. No production DNS cutover
or resource deletion is part of this staging release.

## Implemented and tested locally

- Separate generated SQLite Prisma SDK, with the PostgreSQL schema and Node
  deployment retained. The Cloudflare build explicitly externalizes the SDK
  through Webpack so Wrangler can use the workerd static WebAssembly loader.
- Better Auth signup, tenant creation, verification, login/logout, reset,
  session revocation, MFA and recovery codes use an authentication-specific
  staged unit of work committed in one native D1 batch. General interactive
  Prisma transactions throw; they are never ignored or emulated by independent
  sequential writes. Authentication conflicts are not automatically retried
  after outbound email hooks.
- Native guarded CRM batches implement enquiries/imports, packages, followups,
  quotation snapshots and concurrent versions, booking conversion, manual
  receipts/refunds/expenses, cancellation, settings, team permissions,
  invitations and operator subscription review. Ledger entries invalidate
  booking versions to prevent concurrent overcollection.
- Workspace reads hydrate related records without exceeding D1's bound-variable
  limit. KPI/BI aggregates run native SQLite queries with timezone/DST calendar
  handling. Verified-payment and accounting coverage indicators retain their
  existing truthful unavailable states.
- Consent evidence, automation configuration, queue deduplication, fenced leases
  and job completion use native atomic batches. No live outbound workflow or
  scheduler is enabled by this deployment.
- Migration 0001 contains the 35 application models, tenant composite FKs,
  validation checks, coverage triggers and an atomic assertion table. It has
  already been applied by the user in the dashboard (37 tables including D1's
  migration bookkeeping). Do not edit it after application.
- Migration 0002 adds record version metadata/triggers and ledger invalidation.
  Apply it before deploying the D1 application. It does not copy customer data.
- D1 integers are restricted to JavaScript's exact integer range; unsafe counters
  fail validation. Guarded writes/readsets are bounded and fail explicitly
  instead of partially committing oversized operations.

## Explicitly unavailable in this D1 release

Live advertising OAuth/sync, live WhatsApp provisioning/template sync/sending/
webhook writes, and hotel management have PostgreSQL lock-based transactions
that are not yet ported. D1 rejects these entry points before external provider
requests or writes. Their Node/PostgreSQL behavior remains available. Manual
WhatsApp links, consent and core CRM are separate features.

A complete hotel inventory/booking engine, Razorpay orders/webhooks/settlements
and autonomous bookings are not implemented by this migration. Do not enable
hotel or live WhatsApp flags, provision provider keys or advertise these as
working on D1. These require their own incremental implementation and tests.

## Verification

96 server tests and two real local Pages -> private Worker -> D1 browser tests
passed during release verification. They include tenant isolation, failure
rollback, concurrent quote/booking/receipt operations, idempotent payments,
invitation transfer, MFA/admin permissions, reports, and the 1,500-lead/330-
booking fictional demo. The final release log records any additional tests.
Local success is not a remote deployment or a production-readiness claim.

See [CLOUDFLARE-STAGING.md](CLOUDFLARE-STAGING.md) for exact dashboard settings,
secrets, deployment order and online acceptance checks.
