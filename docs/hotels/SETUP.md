# Hotel foundation setup and staging gate

This release is **stage 1 only**: independent hotel membership, verified-account owner console, profile/amenities/approved-host photo references, room categories, manual platform review and audit/revision protection. It is NOT a production-ready booking marketplace. Date-wise inventory, quotes, expiring holds, checkout, Razorpay, commissions/payouts, hotel AI chat, reservation/voucher/refund workflows and hotel financial/occupancy reports remain subsequent stages in AUDIT-AND-PLAN.md.

## Configuration

Keep `HOTELS_ENABLED=false` in production until deployment and migration are separately approved. No code has been pushed or deployed as part of this hotel work.

For an isolated staging database/app:

1. Back up and restore-test the database. Copy environment settings privately; never paste DB URLs, AI keys, payment keys or passwords into chat or ordinary forms.
2. Run `npm ci`, `npm run db:generate` and `npm run db:migrate` against **staging only**. The additive `20261113000000_hotel_foundation` migration creates four tables and leaves all CRM data in place.
3. If staging uses the existing least-privilege runtime role, apply `npx tsx scripts/grant-runtime-permissions.ts` from the controlled migration environment after the migration. `MIGRATION_DATABASE_URL` and owner privileges stay out of the web runtime. Existing/new hotel tables are included in runtimeTables; review tighter audit-table grants before production.
4. Set server-only `HOTELS_ENABLED=true` in staging before build and runtime. Build-time static marketing navigation also needs the flag when building. `HOTEL_IMAGE_HOSTS` is an optional comma-separated exact hostname allowlist (for example a media/CDN hostname you own). Empty means no photo URLs accepted. HTTPS only, no embedded credentials, custom ports or fragments. There is no upload service or automatic image fetching in this stage.
5. Existing `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, database configuration and transactional email must work. Hotel access ALWAYS requires a verified email even if the agency CRM's verification setting is optional. Keep production `REQUIRE_EMAIL_VERIFICATION=true` once email is validated.
6. Platform reviewers need `PLATFORM_ADMIN_EMAILS`, verified email, enabled MFA and a current MFA-verified session. Agency OWNER does not grant hotel review access. Do not give hotel operators the database migration/owner credentials.
7. `npm run build`, then `npm run start`. Render stays the hosting target. No new provider, database engine or production domain switch is needed.

## Owner workflow

Visit `/hotelier`; unauthenticated users go to `/login?next=hotelier`. Existing accounts reuse their password/MFA. New shared signup currently also creates the normal agency workspace; the login explains this compatibility behavior. Verify email, then return to `/hotelier`.

Create a hotel draft; enter exact address/contact/timezone, amenities and explicit tax percentage. Policies and cancellation text are hotel-entered, not AI-generated or independently approved by software. Add an active room category with declared room count and combined/adult/child occupancy, then submit for verification. Declared room count is not live availability. A draft/pending/rejected/suspended property cannot be booked because this stage has no booking endpoint at all.

Owners see only their memberships/properties. Managers/viewers can exist as operator-provisioned memberships, but hotel staff invitation/delegation UX is a later stage. Viewer access cannot mutate. Profile/category changes reset a property to DRAFT and increment its revision, invalidating an obsolete admin review. Stale edits return 409 and require refresh.

## Platform review

Visit `/admin/hotels` after authenticating as an eligible operator. If MFA proof has expired, verify again via `/two-factor?next=hotel-admin`.

Check business identity/ownership and the profile/tax/policy information independently through an approved operational process. Record a reason; approval also requires explicit verification attestation. PENDING → APPROVED/REJECTED; APPROVED → SUSPENDED. An operator cannot review any property they belong to. Suspension blocks hotel-owner edits; a reinstatement workflow is intentionally not supplied yet and requires a reviewed later stage. Approval does not enable checkout, public listing, messages or payouts.

## Verification commands

Use a disposable/local database:

```bash
npm run db:generate
npm run db:migrate
npm run test:migrations
npm test
npm run build
HOTELS_ENABLED=true PLAYWRIGHT_PRODUCTION=true npm run test:e2e
```

CI enables the hotel feature only inside its isolated test environment. New browser coverage is skipped if the test server's hotel flag is off; full hotel acceptance must run with it on. No live credentials, charges, customer messages or production data are needed for these tests.

## Before a later production cutover

Review migration/permission diffs and all test results. Verify staging email/MFA, two independent hotel accounts, unauthorized APIs, review revocation, business/photo verification procedures and audit retention. Agree the inventory source and approved Razorpay merchant routing model. Choose reliable always-on hosting, queue runner and monitoring. Finish and separately test subsequent modules, including actual concurrent reservations and payment/webhook/refund failure cases. Existing revision-concurrency tests are NOT double-booking tests.

Production deployment and schema application require explicit approval. Since pushing main can trigger Render deployment, do not push this change as an incidental documentation/UI release.

Rollback: disable HOTELS_ENABLED, restore the prior application deployment if needed, and preserve the additive tables for audit/recovery. Do not drop tables or roll production data backward to remove this feature. Backup tooling snapshots public tables, so new hotel tables are included; restore rehearsal is still required before production use.

## External dependencies for subsequent stages

Razorpay must confirm the merchant/partner model, per-hotel authorization, test accounts, signature secrets, refund permissions, commission and payout/settlement model. Route/OAuth is unconfirmed and must not be inferred. No secret key form has been added. AI provider usage/retention/consent and pricing require configuration before hotel chat. PMS/channel-manager credentials and ownership of availability must be agreed before promising inventory outside TravelOS is synchronized.
