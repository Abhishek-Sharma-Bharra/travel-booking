# Deploy TravelOS staging: Cloudflare Pages + Workers + D1

## Resources and architecture

- Private backend: `vashisht-travelos-api-staging` (workers.dev disabled).
- D1: `vashisht-travelos-staging-db`, UUID
  `7b40469d-2035-4275-89ab-c4ebcc53e279`, binding `TRAVELOS_DB`.
- Frontend: Pages project `travel-booking`, canonical origin
  `https://travel-booking-dnn.pages.dev`.
- Root `wrangler.jsonc` configures Pages; `cloudflare/worker/wrangler.jsonc`
  configures the backend. Always specify the latter for Worker commands.

The Next.js app uses server rendering and authenticated APIs. Pages serves its
hashed static bundles and a same-origin streaming gateway; the private Worker
runs SSR/RSC and APIs through OpenNext. This is not a static SPA export.
Cookies, original URL/Origin and signed body bytes survive the gateway. Trusted
Cloudflare client IP headers are forwarded for rate limits. Dynamic responses
are private/no-store and staging is noindex. Noncanonical preview origins return
421; use the canonical Pages URL for login, not a commit-preview URL.

## 1. Configure backend secrets in the dashboard

Workers & Pages -> vashisht-travelos-api-staging -> Settings -> Variables and
Secrets -> Add -> type Secret:

- `BETTER_AUTH_SECRET`: a new random secret of at least 32 random bytes. Generate
  it in a trusted password manager; save it privately. Do not use the Cloudflare
  deployment API token, a password, the local test secret or a value from chat.

Without a valid authentication secret the Worker returns 503 before serving the
application. No `DATABASE_URL` or Hyperdrive binding is needed. D1 runtime selection and the
binding are checked into the Worker config. Support email is
`avinav.vashisht@gmail.com`.

Staging initially has `REQUIRE_EMAIL_VERIFICATION=false` for fictional test
accounts only. Signup/login work without mail; invitations/reset/verification
emails require `RESEND_API_KEY` (Secret) and `MAIL_FROM` (verified sender). Before
real customer use, configure these, test delivery, and change
`REQUIRE_EMAIL_VERIFICATION=true` in the Worker config and redeploy. Because
Wrangler manages plaintext vars, dashboard plaintext overrides can be replaced
on later deployments. Secrets persist separately. Gmail SMTP is not the Workers
mail transport. Optional enquiry AI needs its existing `OPENAI_API_KEY` Secret.
Do not put any of these keys in Pages build variables or frontend JavaScript.

## 2. Deploy the Worker from Git

Workers & Pages -> backend -> Settings/Builds (or Deployments -> Build settings):

| Setting           | Value                                             |
| ----------------- | ------------------------------------------------- |
| Repository/branch | Abhishek-Sharma-Bharra/travel-booking / main      |
| Root directory    | `/`                                               |
| Build command     | `npm run db:generate && npm run cloudflare:build` |
| Deploy command    | `npm run cloudflare:release:worker`               |
| Build variable    | `NODE_VERSION` = `24.19.0`                        |

Save, then retry the latest build after the code is pushed. The release command
applies only the named staging D1 migrations, inserts the separate fictional
read-only demo idempotently, then uploads the Worker. An error stops the release;
do not skip failed migrations. No real customer data is seeded. 0002 adds one
internal version table, so the table count increases from the existing 37.

The build token needs permissions for this account's Worker deployments and D1
writes. Keep the existing working token unless an actual permission error occurs.
No token is required in chat. A Git push triggers this configured staging build;
Render auto-deploy remains off.

## 3. Create the Pages frontend from the dashboard

Workers & Pages -> Create application -> Pages -> Connect to Git (wording may
be "Import an existing Git repository"). Select the same repository, branch main.

| Setting                    | Value                                             |
| -------------------------- | ------------------------------------------------- |
| Project name               | `travel-booking`                                  |
| Framework preset           | None                                              |
| Root directory             | `/`                                               |
| Build command              | `npm run db:generate && npm run cloudflare:build` |
| Build output directory     | `cloudflare/pages-dist`                           |
| Build environment variable | `NODE_VERSION` = `24.19.0`                        |

Select **Pages**, not another Worker. Pages has no `wrangler deploy` deployment
command. It reads root `wrangler.jsonc`, including the `TRAVELOS_BACKEND` service
binding to the already deployed private Worker and `PUBLIC_ORIGIN`. Confirm these
under Pages -> Settings -> Bindings after deployment. No backend API keys belong
in Pages. Both builds derive the same Next build ID from the same Git commit;
verify Worker and Pages deployed the same commit before acceptance.

If the project name is unavailable, stop and update all three configured origins
(Pages PUBLIC_ORIGIN, Worker BETTER_AUTH_URL and PUBLIC_SITE_URL), plus the build
wrapper URL, together. Do not try to use an unrelated Pages hostname unchanged.

## 4. Verify online before sharing

Open the canonical Pages URL, not a hash-prefixed preview link. Verify:

1. Home, CSS/images and read-only demo load; Analytics/BI charts render.
2. Fictional new account signup, signout and login; tenant sees an empty workspace.
3. Create package/enquiry/quotation, accept a booking, add a manual receipt,
   inspect balances and Analytics/BI, reload and confirm persistence.
4. Another test account cannot read the first tenant's records. Mobile layout
   works. Signout denies private API access. No secrets appear in browser assets.
5. `/api/health/live` returns 200. `/api/health/ready` deliberately remains 503
   until mail, verification, operator allowlist/MFA and all launch checks pass.
   Liveness 200 alone does not establish database or business readiness.
6. No real hotel bookings, ads sync or official WhatsApp sends are enabled.
   See D1 migration status for the unported modules.

No custom domain, paid plan, production data transfer or Render deletion is
performed automatically. Confirm the actual Worker bundle/account limit in the
build log; do not purchase a plan without explicit authorization. Email, AI and
other provider usage are separate costs.

## Local reproduction

Use Node 24.19.0 and `npm ci`, then:

```sh
npm run db:generate
npm run d1:schema:check
npm run d1:migrate:local
npm run d1:demo:local
npm run cloudflare:local-env:d1
npm run cloudflare:build
# Separate terminals, sharing .local/cloudflare-state:
npm run cloudflare:dev:worker
npm run cloudflare:dev:pages
# After both are ready:
npm run test:e2e:cloudflare
```

Local vars, generated SDKs, SQL fixture and build artifacts are gitignored.
`npm test` also runs the existing PostgreSQL regressions (needs its local test DB)
and isolated real D1 suites. `npm run typecheck` checks both runtime paths.
Never point tests at a live database.

## Production data and rollback

D1 staging is a fresh database. Existing Render accounts/bookings do not appear
until a separate reviewed export/conversion/import. Validate counts, tenant FKs,
exact money, timestamps, auth hashes and financial totals in a disposable copy;
then plan a write freeze, backups, cutover and rollback before actual transfer.
Do not paste Render credentials in chat or feed PostgreSQL SQL into D1.

Keep matching Worker and Pages artifacts/commits for rollback. Revert both sides
when required; retain additive schema migrations. Do not drop version metadata
while an older request could still use it. Render remains available at its
existing URL; Cloudflare staging does not redirect it or change DNS.
