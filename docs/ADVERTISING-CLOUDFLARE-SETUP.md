# Agency advertising connections on Cloudflare

## What this release enables

Each agency owner can authorize their own Meta or Google account, select only
provider-returned advertising accounts, synchronize existing daily advertising
performance, and disconnect. D1 now uses guarded native atomic batches for
credential activation, selection, sync leases, checkpoints and report replacement.
The existing PostgreSQL path is retained. No migration is necessary; all tables
already exist. Secrets are AES-256-GCM encrypted with agency-bound context.

This is a read/report integration. It does not create/edit ads, spend a budget,
import Meta/Google native lead forms, send customer messages or claim provider
conversions are CRM bookings. Existing TravelOS campaign links can capture
website enquiries with source/UTM attribution. Native lead forms require a
separate, signed webhook integration and additional provider permissions.

## Prerequisites and status

The owner confirmed on 18 November 2026 that neither developer application is
created. No real provider credentials have been configured or tested by this
release. Real account authorization, app approval and production acceptance are
pending. Cloudflare account access is unavailable from this environment.
Do not paste credentials into chat or commit them to Git.

Fix/verify the existing backend outage before sending agencies through OAuth.
Confirm both Pages and Worker successfully deploy the same Git commit, D1 is
bound as TRAVELOS_DB, BETTER_AUTH_SECRET remains intact, and /api/data returns
JSON for the signed-in owner. Gateway error handling is not an outage cure.

## 1. Create the Meta developer application

Open https://developers.facebook.com/apps/ while signed into the business
administrator's Meta account. Create a business application/use case supporting
Facebook Login and the Marketing API. Product names/screens can vary by account.
Use the app's supported, currently active Graph API version, not a sample version.

Set this exact valid OAuth redirect URI:

    https://travel-booking-dnn.pages.dev/api/integrations/meta/callback

The current integration requests ads_read only. Configure the matching login
product, app domain/website, Privacy Policy and Terms; complete Meta's required
data-deletion instructions/callback configuration. Complete business verification
and the access review Meta requires before onboarding unrelated agencies.
Development-mode access is for properly assigned app roles and permitted assets;
it is not approval for arbitrary customers. If a Meta business login configuration
requires a config_id instead of scope-based OAuth, adapt/test that product's
contract before activation; do not claim it has been validated here.

Provide the App ID, App Secret and version privately to Cloudflare as listed
below. Each agency still needs provider-granted access to its own ad account.
No ads_management or lead-form permissions are requested by this release.

## 2. Create the Google project

Open https://console.cloud.google.com/ and create/select a dedicated project.
Enable Google Ads API. In Google Auth Platform configure app branding, audience,
support email and data access. Add the adwords scope:

    https://www.googleapis.com/auth/adwords

Create an OAuth client with application type Web application and redirect URI:

    https://travel-booking-dnn.pages.dev/api/integrations/google/callback

During development add authorized testers and permitted test ads accounts.
A public multi-agency rollout needs the OAuth/provider verification applicable
to this scope and a Google Ads developer token with appropriate account access.
Obtain the developer token through Google Ads manager-account API Center; its
access level may restrict use to test accounts. Development/test-mode refresh
credentials may expire under Google's testing policies.

OAuth domain/brand ownership verification can require a custom domain you own;
a pages.dev URL alone does not establish ownership of the parent pages.dev domain.
If a custom domain is required, configure it and update the canonical origin,
Better Auth trusted URL and BOTH callback registrations as one reviewed change.
No domain/DNS changes are performed by this release.

Set an active Google Ads API version supported by your developer token/project.
Do not copy the fictional v99 test value from automated tests.

## 3. Configure Cloudflare privately

Cloudflare -> Workers & Pages -> vashisht-travelos-api-staging -> Settings ->
Variables and Secrets. Store these sensitive values as Secret:

- META_APP_SECRET
- GOOGLE_CLIENT_SECRET
- GOOGLE_ADS_DEVELOPER_TOKEN
- INTEGRATION_ENCRYPTION_KEYS

The keyring is JSON such as {"ads-v1":"<independent random 64-hex key>"}.
Generate a cryptographically random 32-byte key with a trusted password manager
or `openssl rand -hex 32` in a private terminal. Keep an encrypted backup outside
Git. Set INTEGRATION_ACTIVE_KEY to ads-v1. Keep old keys when rotating so existing
agency tokens remain decryptable. Never use BETTER_AUTH_SECRET as this key.

Set the remaining backend variables:

- META_APP_ID
- META_GRAPH_VERSION (active version from Meta)
- GOOGLE_CLIENT_ID
- GOOGLE_ADS_API_VERSION (active version from Google)
- INTEGRATION_ACTIVE_KEY

Keep BETTER_AUTH_URL=https://travel-booking-dnn.pages.dev and the existing auth
secret. No provider secret belongs in Pages build variables or NEXT_PUBLIC_*.
The API readiness report lists names of missing configuration, never values.
Presence/format checks are not proof of app approval or a valid provider token.

## 4. Agency workflow and acceptance

1. Sign in as an agency OWNER -> Integrations. Managers may read reports; agents
   cannot manage connections. Fictional demo connections are disabled.
2. Expand Connection setup requirements to see the exact callback and pending
   configuration. The Connect button enables only after backend configuration.
3. Connect Meta/Google, log in on the provider's real domain and approve access.
   OAuth state is single-use, agency/user/provider-bound and expires in 10 minutes;
   Google uses PKCE. Do not share or log callback URLs containing codes/state.
4. Return to TravelOS, load authorized accounts and select the correct account.
5. Sync a small, closed calendar date window. D1 permits at most 500 daily rows
   per complete window; use a narrower window for larger accounts. Original
   currency/timezone and provider-reported conversion definitions are preserved.
6. Test a second agency and verify it cannot see/select/disconnect the first
   agency's records. Test revoked tokens, retries, concurrent selection/sync,
   a partial provider failure and disconnect during a sync.
7. Confirm no campaign/budget writes, outbound messages, invented leads or CRM
   bookings occurred. Provider consent/scope may be broad (Google adwords);
   this implementation calls read/report methods only.

A pending/missing configuration must remain visibly unconfigured. Never display
a successful real connection based only on mocked provider tests.

## Recovery and rollback

A failed/partial sync retains the previous complete report. Do not replace a
completed window until the entire new snapshot is validated and commits atomically.
Disconnect clears stored credentials and invalidates syncs, even for an expired
subscription. Revoke provider authorization separately in Meta/Google settings.

No schema changes are needed. Roll back application code if necessary while
retaining encrypted connection and audit records. Do not clear encryption keys,
reset D1, overwrite existing auth secrets or delete agency records as a fix.

## Verification on 18 November 2026

- TypeScript check and Cloudflare production build passed.
- Complete existing/updated server suite: 105 passed. Two additional native D1
  tests passed for lease exclusion, expiry, disconnect during sync and injected
  SQLite failure rolling back report deletion/insertion/completion together.
- The Meta and Google contract tests run on both PostgreSQL and native D1,
  including PKCE, replay/cross-agency denial, encrypted refresh, account-selection
  concurrency, exact currency values, pagination and failed-sync preservation.
- Local Pages -> workerd -> D1 browser suite: 4 passed, including original CRM,
  ad landing pages, read-only demo and desktop/mobile integration readiness UI.
- Provider HTTP responses were simulated. No real Meta/Google app, ad account or
  native lead-form webhook was connected by these tests. No production migration
  or data modification was performed.
