# D1 migration: requested target, not yet deployed

The user selected Cloudflare D1 instead of Render or Neon PostgreSQL. The
Cloudflare staging deployment currently published from main still targets
PostgreSQL. Successful deployment does not establish D1 compatibility.
Do not attach production Render credentials or represent D1 as connected.

## Repository audit

The current Prisma schema has 35 models. There are 34 transaction call sites
under src/lib, including interactive transactions. Better Auth explicitly uses
its PostgreSQL Prisma adapter with transactions enabled. PostgreSQL migration
history includes constraints and triggers beyond the Prisma schema.

Required migrations before the D1 runtime can replace PostgreSQL:

1. Add an isolated SQLite/D1 schema and D1 adapter path without breaking the
   existing Node/PostgreSQL deployment. Hotel string arrays need JSON storage;
   PostgreSQL interval defaults need an application or SQLite equivalent.
2. Convert existing multi-statement operations to D1-supported atomic batches,
   conditional writes and database constraints. D1 does not provide PostgreSQL
   interactive transactions or row/advisory locks. Never emulate transactions
   with sequential independent requests, ignore a transaction callback, or
   remove locks without replacing the invariant.
3. Preserve all tenant composite foreign keys, quote-version uniqueness,
   idempotent receipts/refunds, subscription/invitation boundaries, and booking
   balances. Translate PostgreSQL trigger protections, not only table columns.
4. Replace FOR UPDATE, SKIP LOCKED, pg_advisory_xact_lock/hashtextextended and
   PostgreSQL-specific reporting SQL (casts, LATERAL joins, date functions).
5. Adapt Better Auth signup/account/session operations and persistent rate
   limiting to supported D1 atomicity. Verify signup failures cannot leave
   orphan agency/user rows and tenant or MFA checks remain enforced.
6. Port BI/KPI reports and timezone/date semantics; verify financial totals,
   cancellation/refund states, exact money and large advertising counters.
7. Add local D1 migration and runtime tests: concurrent booking conversion,
   quote versions, duplicate receipts/webhooks, rollback/failure injection,
   cross-tenant reads/writes, signup/MFA, reports and exports. PostgreSQL tests
   alone do not prove D1 compatibility.

## Remote setup pending

The user created an empty D1 database named vashisht-travelos-staging-db in the dashboard.
Its database ID is recorded in cloudflare/d1/wrangler.jsonc and the staging
Worker configuration. TRAVELOS_DB is the D1 resource binding. Binding the
resource does not switch the application database adapter.
Its database ID and account ID identify resources; neither is a database
password. Do not request or print API tokens. The staging Worker can bind the empty database for setup, but adding a
binding to the existing pg adapter does not migrate the application. Do not run PostgreSQL SQL directly
in the D1 console. Do not introduce placeholder database UUIDs into the live
Wrangler configuration.

Render remains unchanged and its auto-deploy is off. No existing records have
been copied or deleted. The immediate target is a fresh, isolated D1 staging
application. Production data transfer and cutover require a separate reviewed
plan and the user's approval. The prior PostgreSQL staging guide describes the
currently deployed code, not the newly requested D1 target.


## Implemented foundation (application switch remains pending)

- `cloudflare/d1/schema.prisma` is a separate SQLite schema, generated from the
  unchanged PostgreSQL schema. Arrays become JSON and the trial interval has a
  SQLite default. The existing PostgreSQL Prisma client is not overwritten.
- `scripts/cloudflare/d1-schema.ts` uses pinned Prisma WASM and a disposable
  LOCAL D1 instance to generate official SQLite DDL. It never requests remote
  credentials or accesses the dashboard database.
- `cloudflare/d1/migrations/0001_initial.sql` includes all 35 application tables,
  existing tenant composite keys and unique indexes, custom validation checks,
  and cost/advertising coverage-invalidation triggers. One internal assertion
  table supports guarded atomic writes. Freeze this migration after its first
  remote application; later changes must be new migrations.
- D1 numbers cross the JS binding as numbers, so BigInt storage is deliberately
  bounded to +/-9007199254740991. Values beyond that range are rejected instead
  of silently rounded. Larger counters need a separately reviewed text format.
- `src/lib/d1/atomic.ts` provides condition-guarded D1 native batches with full
  rollback and conflict handling. Conditions and write SQL are internal, with
  parameter binding for values; authorization must still supply tenant scope.
- `src/lib/d1/adapter.ts` rejects interactive transactions. The stock Prisma D1
  adapter explicitly warns that it ignores transactions; that behavior must not
  be used for this application's financial or authentication operations.
- Neither helper is wired into `src/lib/db.ts` yet. Auth, CRM actions, BI/KPI,
  invitations, subscriptions, and background jobs still need individual ports.
  This commit is NOT a working D1 version of the website.

## Verification and migration commands

`npm run d1:schema:check` verifies generated schema/DDL drift against the
PostgreSQL source. CI runs it. `npm run d1:migrate:local` applied 105 SQL commands
successfully to a local D1 copy only. Nine actual local workerd/D1 tests cover
schema/tenant constraints, quote uniqueness, rollback after later failures,
concurrent version guards, money and large-counter checks, coverage triggers,
and refusal to ignore transactions. All 76 server tests and TypeScript passed.
These are foundation tests, not proof that the full app runs on D1.

Remote application is an explicit separate step:

```
npm run d1:migrate:remote
```

That command needs D1 edit permission and targets ONLY the named staging UUID.
It is not part of npm build or Workers auto-deploy. It has not been executed in
this workspace. Do not change this config to point to a live database. The
user's dashboard screenshot showed zero application tables, which is expected
until a remote migration is applied. No user records are seeded or copied.

Next acceptance gate: port and test signup/login/MFA, CRM transactions and
report queries before enabling a D1 runtime or publishing Pages to customers.
Use D1 atomic batches and constraints, not sequential pseudo-transactions.
