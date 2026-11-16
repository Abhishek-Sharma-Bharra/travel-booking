# Cloudflare staging migration

This supersedes the earlier Render-only direction for staging. Render remains the
production origin until a separate cutover approval. Nothing in these scripts
migrates a database, changes DNS, sends WhatsApp messages, or deploys on git push.

## Architecture and audit

The application is Next.js App Router, Better Auth, Prisma with the PostgreSQL
adapter, and server-rendered tenant workspaces. It is not a static SPA. Exporting
it to Pages would remove authentication and server-rendered CRM behavior.

- Pages serves browser bundles and a same-origin streaming gateway.
- A private Workers service runs Next.js SSR/RSC, auth and existing APIs through
  OpenNext. This is a hybrid deployment, not two independently rewritten apps.
- Requests retain their original Pages URL, Origin, cookies and body bytes.
  There is no public backend URL or permissive credentialed CORS configuration.
- The backend has workers.dev and preview URLs disabled. Pages uses a service
  binding. The gateway accepts only PUBLIC_ORIGIN; branch preview hostnames are
  deliberately rejected until configured as their own isolated environment.
- Dynamic responses are private/no-store. Hashed JS/CSS are served by Pages.
  No shared incremental cache, R2, Durable Object queue, or Images purchase is
  required by this configuration. Image transformations are not enabled.
- PostgreSQL stays PostgreSQL. No D1 conversion or schema change is introduced.
  Workers creates a Prisma pool per request and disconnects after the response
  stream completes, avoiding sockets reused across unrelated requests. An
  optional HYPERDRIVE binding is preferred over DATABASE_URL when configured.
  Node/Render retains its existing process-level client behavior.
- Workers email uses Resend HTTPS; SMTP remains supported on Node/Render.
- The existing AI enquiry assistant is reused. A complete hotel booking engine
  and Razorpay implementation are not present and are not created by migration.
  Hotel foundation and live WhatsApp sending remain disabled in staging.

Next was patched from 16.4.3 to 16.4.6 to satisfy OpenNext 1.20.17's supported
version range. Wrangler is pinned to 4.162.0. Upstream docs were unavailable from
the workspace network; the installed Next docs and adapter templates were used.

## Build and local verification

Use Node 24 and npm ci. Generate the Prisma client with npm run db:generate.

```sh
npm run cloudflare:build
npm run db:start
npm run db:migrate
npm run cloudflare:local-env
# Terminal 1
npm run cloudflare:dev:worker
# Terminal 2
npm run cloudflare:dev:pages
# Terminal 3, with the local servers running
npm test
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_STAGING=true \
PLAYWRIGHT_SITE_ORIGIN=https://vashisht-travelos-staging.pages.dev npm run test:e2e
```

The local-env helper rejects non-localhost database URLs. It writes ignored,
mode-0600 .dev.vars files with a random local auth secret. Do not upload these.
Local Pages is http://localhost:3000, Worker is localhost:8787. Local dev needs
an explicit --service option (already included in the npm script).

In restricted workspaces set XDG_CONFIG_HOME and WRANGLER_LOG_PATH to writable
locations, and npm_config_cache if needed. Do not change HOME.

Build exports no secrets into Pages: only .open-next/assets and a gateway bundle
are copied. SITE_INDEXING_ENABLED=false and staging PUBLIC_SITE_URL are set by
the build wrapper so static metadata and headers also target staging. Use a
single build for both deployment artifacts. Do not run a Render next build in
between the Cloudflare build and deployment.

## Account authorization and remote resources

A browser dashboard login does not authorize Wrangler in this workspace.
Run wrangler login in a terminal where its browser callback can complete, or
configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID through the execution
platform's private secret settings. Never paste credentials in chat or git.
The token needs access to Workers scripts/services/assets and Pages for the
chosen account. Confirm wrangler whoami before deployment.

The dry-run bundle is approximately 3.5 MiB compressed, above the Workers Free
3 MiB script limit. A paid Workers plan or further bundle reduction is needed.
Do not purchase/upgrade automatically. Check current account quotas and pricing.
No paid plan was activated here. PostgreSQL and email/AI costs are separate.

Create an isolated PostgreSQL staging database with the application's existing
migrations applied. Do not use the production database for these tests. Use the
provider's external connection string and verified TLS for remote PostgreSQL;
do not disable certificate checks. Optional Hyperdrive requires its own setup
and remote verification; no placeholder Hyperdrive binding is committed.

Configure backend secrets using Wrangler's interactive secret input or the
Cloudflare dashboard. Use the config file below for secret commands:

```sh
npx wrangler secret put DATABASE_URL -c cloudflare/worker/wrangler.jsonc
npx wrangler secret put BETTER_AUTH_SECRET -c cloudflare/worker/wrangler.jsonc
```

DATABASE_URL must refer to the isolated staging database. BETTER_AUTH_SECRET
must be a new random secret (at least 32 bytes), not a reused local test secret.
For verified email flows also set RESEND_API_KEY, MAIL_FROM and
REQUIRE_EMAIL_VERIFICATION=true. Confirm a verified sender first. Staging
without mail can use REQUIRE_EMAIL_VERIFICATION=false only for fictional test
accounts; email/password-recovery production readiness is not implied.
Optional existing AI features need OPENAI_API_KEY and their existing model
configuration. Do not copy production provider tokens blindly. No keys go in
Pages; its only variable is PUBLIC_ORIGIN and it has a private service binding.

Review every existing required env setting in .env.example and the launch
readiness checks; staging templates are not a claim all integrations are active.
BETTER_AUTH_URL, PUBLIC_SITE_URL and Pages PUBLIC_ORIGIN must agree. The proposed
Pages project name must be available; otherwise change all three origins and
rebuild. Existing auth redirects, origin checks and tenant authorization remain.

## Manual staging deploy (after authorization and resource setup)

```sh
npm run cloudflare:build
npx wrangler deploy --dry-run -c cloudflare/worker/wrangler.jsonc
# Create Pages project once, if absent:
npx wrangler pages project create vashisht-travelos-staging --production-branch main
npm run cloudflare:deploy:worker
npm run cloudflare:deploy:pages
```

Pages commands run from cloudflare/pages because Pages does not accept an
arbitrary --config path. The Workers backend must exist before Pages resolves
its service binding. Set secrets before making Pages reachable. No automatic
GitHub/Render deployment workflow was added. Main currently has other local,
unpublished feature work: pushing it would also trigger the existing Render
integration and needs separate review.

## Remote acceptance and cutover

Local tests do not prove remote networking or account configuration. Before
cutover, verify signup/login/logout, verified mail/reset links, session renewal,
CSRF rejection, two-tenant isolation, enquiry/quote/booking/ledger/report exports,
images, mobile layout, body streaming, failed requests, and database connection
cleanup under repeated/concurrent requests against staging. Confirm there are
no private HTML/RSC cache hits. Validate custom-domain cookies and authorized
callback URLs after a domain is selected. Schedule the existing authenticated
automation runner separately; no cron or live outbound automation is enabled.

For production, first review/back up the current database and decide the single
write source. Configure production-only secrets/origins in separate resources.
Coordinate Worker and Pages versions; keep both artifacts for rollback to avoid
stale chunks after an independent backend update. Changing the auth domain can
require users to log in again. Ask for explicit production cutover approval,
then update domain/provider callbacks and monitor. Keep Render available for
rollback; do not delete Render or its PostgreSQL database as part of staging.

## Verification recorded in this workspace

- Cloudflare/OpenNext production build passed on Next 16.4.6.
- Wrangler backend upload dry-run passed (roughly 3.5 MiB gzip).
- TypeScript check passed.
- 67 server tests passed, including four new gateway/resource/mail tests.
- In local workerd with Pages -> private Worker -> local PostgreSQL, 22 browser
  tests passed. The hotel test was skipped because HOTELS_ENABLED is false.
  These cover signup, logout/login, the full CRM receipt flow, tenant/role/CSRF
  denial, MFA, BI/KPI exports, mobile UI, and staging crawler restrictions.
- Earlier full-run failures were traced to production SEO expectations on a
  deliberately noindex staging deployment and reused signup rate-limit buckets.
  Tests now accept explicit staging SEO expectations without weakening default
  production assertions; the final fresh run passed with rate limits enabled.
- Remote deployment, verified remote TLS/Hyperdrive, provider email delivery,
  account limits, and production cutover have NOT been performed. Wrangler
  whoami reports unauthenticated; a dashboard login alone is insufficient.
