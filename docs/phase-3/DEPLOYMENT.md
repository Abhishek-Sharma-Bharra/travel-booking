# Review and approved deployment

The user's master prompt requires approval before production deployment. This branch has not been pushed or deployed and has not changed a production database, plan or paid feature flag.

## Review / validation

1. Keep Node 24 and existing dependencies/generated clients. No new dependency/provider subscription is required.
2. Confirm PostgreSQL `DATABASE_URL` is local before `npm run db:migrate`; apply D1 additions with `npm run d1:migrate:local` only. The test suite creates/drops a generated localhost `test_p3_*` database and ephemeral D1.
3. Run typecheck, `npm test`, frozen D1 schema check, production dependency audit and Cloudflare build. Stop local Wrangler watchers before rebuilding generated output.
4. Start the local private Worker with `WORKSPACE_OPERATIONS_ENABLED=true` and `WORKSPACE_ASSISTANT_ENABLED=true`, then the Pages service binding. **Wait for `/api/health/live` to return the real healthy JSON response before starting browser tests**; a Pages process can briefly be ready while its local Worker binding is not yet registered.
5. Run Cloudflare browser tests plus the staging SEO suite. Review real signup, initial progress, populated/empty dashboards, assistant previews, human-review forms, agent isolation, mobile/tablet controls, print documents and old hotel/transport/campaign flows.
6. Optional provider tests use mocked transport. A live AI key, gateway connection or real payment account must not be activated as a side effect of this UI review.

## Production steps after explicit approval

- Review the exact commit and active Pages/private Worker/D1 bindings. Do not use the stale unrelated Worker integration.
- Carry forward the Phase 2 production incident gate: inspect the original live 500/1101 exception and confirm bindings/routes before declaring recovery. Local tests do not prove the old production incident is fixed. Live-site access is not available under this environment's network policy.
- Back up D1, verify a restore in an isolated database, inspect the current migration list and retain all existing data. This branch also includes the not-yet-deployed Phase 2 work, so account for migrations **0007 and 0008** and both feature flags.
- Deploy paired code with new feature flags disabled; apply additive migrations in reviewed order. Do not replace old migrations, import fictional test fixtures or reset production.
- Enable new guided tools and Phase 2 operations only after their schema and binding checks pass. Keep `PAID_AI_ENABLED=false`, live payments and messaging at their existing approval settings.
- Smoke-test an isolated agency through signup → studio → guided package/enquiry/itinerary/quotation preview → explicit existing-form review. Confirm no quote/booking/payment is created merely by asking the assistant. Verify unknown requests remain retry-safe, agent costs are absent, and private API responses remain no-store JSON.
- Monitor Worker requests/CPU, D1 reads/writes/storage, failures, reservations and usage journal growth. The existing workspace snapshot still loads permitted data; these tests do not prove arbitrary agency size or Free-plan capacity.
- Optional paid routing requires `WORKSPACE_ASSISTANT_LIVE_APPROVED=true` and an explicit `WORKSPACE_ASSISTANT_LIVE_AGENCY_IDS` allowlist, in addition to global paid-AI approval and the secure key. It requires separate provider/privacy/model/rate approval, secure key storage, a small staging validation, token/invoice reconciliation and failure/retry checks. Currency costs and global AI credits across all old modules are not automatically consolidated here.

## Rollback / retention

Disable `WORKSPACE_ASSISTANT_ENABLED` and return to the reviewed Phase 2 code if needed. Retain usage reservations/history until reconciled; do not replay unconfirmed paid requests automatically. Do not delete customer records or replace production with a stale backup. Preserve the Phase 2 in-house guest cancellation/refund guard even if its UI is disabled; assess active stays before any rollback to Phase 1.

Usage retention/archival must follow an agreed policy and storage measurements. No automatic historical data deletion is introduced by this change.
