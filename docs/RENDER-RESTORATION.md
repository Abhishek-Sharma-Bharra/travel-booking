# Render feature restoration — 12 November 2026

This is the current release guide. Older audit/verification documents describe historical development runs, not the current production release.

## Scope

All code stays in `Abhishek-Sharma-Bharra/travel-booking`, on `main`. Hosting remains Render and the existing PostgreSQL database remains the source of truth. No Cloudflare Worker, Wrangler, OpenNext, Pages deployment, Cloudflare credentials or Neon database is introduced.

Restored modules: advanced role-based analytics, sales/operations assistant, reviewed manual WhatsApp handoff, manual subscription requests, account recovery/invitations/MFA, Meta Ads and Google Ads connectors, official WhatsApp consent/templates/webhooks, durable automation, first-login/manual guided tour, encrypted backup tools, security checks and navy/ivory/copper theme.

The current enquiry → quotation → booking navigation, concurrent quotation version allocation, duplicate booking prevention and customer PDF/message-copy improvements are preserved. Approved quotations remain bookable. Generated customer proposals require review/approval before the UI enables print/copy; manually prepared quotes retain the existing print workflow.

## What works without provider credentials

The CRM, package-maintained itineraries, deterministic quote calculations, recorded-data analytics, template follow-up drafts, manual WhatsApp handoff, PDF printing, subscription review requests and guided tour. Missing/incomplete financial data is shown explicitly. Supplier costs are restricted by role and excluded from customer PDFs.

## Operator setup still required

| Feature                             | Private setup / approval                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account emails                      | Configure `MAIL_FROM` and authorized SMTP credentials or Resend API credentials; verify actual reset/invite/verification delivery before enabling `REQUIRE_EMAIL_VERIFICATION=true`. Never paste secrets into chat. |
| MFA-protected service billing admin | Allowlist the operator via `PLATFORM_ADMIN_EMAILS`, verify the email and enroll MFA. Existing regular owners do not gain platform access.                                                                           |
| Live AI extraction                  | Server-only `AI_API_KEY` and selected `AI_MODEL`; paid provider usage remains separate. Demo uses fictional extraction; missing configuration gives a clear error.                                                  |
| Meta Ads                            | App permissions/review, configured API version, HTTPS callback, authorized agency advertising account, encrypted credential vault.                                                                                  |
| Google Ads                          | OAuth client, developer token/API version, supported account permissions, HTTPS callback and encrypted credential vault.                                                                                            |
| Official WhatsApp                   | Authorized agency number/channel, provider-approved templates, opt-ins, webhook verification and signature secrets. Operator provisions credentials. Global provisioning/send approvals remain false by default.    |
| Scheduled automation                | Configure a private `AUTOMATION_RUNNER_SECRET` and authorized scheduler to invoke the runner; agency policies default off. Render hosting alone does not schedule jobs.                                             |
| Backup/recovery                     | Separate encryption key, encrypted offsite storage, retention and a restore rehearsal; runtime DB user should have least privilege.                                                                                 |

OAuth callback URLs use the actual Render HTTPS origin and `/api/integrations/meta/callback` or `/api/integrations/google/callback`. Use current provider documentation for supported permissions and account approval. Never expose provider secrets in public fields or frontend code.

Subscriptions remain **manual billing** with price on request. Requests do not activate paid access. Razorpay, automatic charging, live hotel/flight inventory and voice agent were not previously completed and are not claimed as part of this restoration. No real customer messages, charges, OAuth authorizations or paid resources were initiated by this work.

## Database upgrade and release

There are 18 repository migrations, including the already released quotation-version migration. Restored migrations add auth/security, assistant, analytics, integration, messaging, automation and onboarding structures. Composite foreign keys and ledger checks can reject inconsistent legacy rows; investigate discrepancies instead of deleting records or resetting the database.

Two archived quotation migrations were adapted to tolerate the version column/index already deployed on Render and preserve existing nonzero versions. The archived security migration grants existing Trial agencies 14 days from upgrade time, avoiding immediate read-only access from old account creation dates; it does not change recorded paid/paused statuses. If a database previously applied archived migration files, inspect its migration history/checksums before release; do not blindly mark failed migrations applied.

1. Keep the previous Render release available. Take an encrypted backup of the actual database and verify a restore in isolation. The local test database is not a production backup.
2. Inspect the actual database migration history and data integrity. Apply and validate this release on an isolated restored copy, with outbound providers disabled.
3. Install dependencies, generate Prisma client, run migrations once as the authorized owner in a controlled release job, and build. Commands: `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run build`. Keep migration credentials separate from runtime credentials. Do not run migrations concurrently per instance.
4. Use existing Render origin and stable `BETTER_AUTH_SECRET`; configure only approved provider integrations. Do not enable email verification before delivery works. Preserve existing demo data (`db:seed` is non-destructive).
5. Obtain production publication approval. Pushing `main` may trigger Render automatic deployment. Code restoration alone does not verify that deployment or configure secrets.
6. Check sign-in, existing records, enquiry/quote/booking/receipt balances, approved quote conversion, PDF, role boundaries, tour, provider configuration errors and subscriptions with designated test accounts.

Rollback: keep the previous app release available and disable new automation/provider execution first. Additive tables may stay in place; do not drop data. If reverting app code, avoid operations that depend on the newer schema/workflows until compatibility is checked. Restoring a backup over live records requires a separately reviewed recovery decision.

## Reproducible verification

`npm run test:migrations` refuses non-local database hosts and creates/drops only randomly named disposable databases. It exercises fresh installation, original two-migration upgrade and the currently deployed three-migration upgrade, including historical quotations with nonsequential versions, unchanged totals/snapshots and access for an old Trial agency. The existing database is never a reset target.

Verified locally on 12 November 2026:

- TypeScript checks and Next.js production build passed.
- 52 backend/unit/integration tests passed, including tenant isolation, quote versions, duplicate bookings, authorization, webhook signatures, consent, retry fencing and encrypted backup integrity.
- 18 Chromium browser tests against the production build passed, including the existing sales journey, PDF generation/copy, reviewed proposals, mobile analytics, guided tour and MFA.
- All 18 migrations passed on fresh, original two-migration and current three-migration disposable databases. Historical quotation totals/snapshots, nonsequential quote versions, bookings and manual receipt amounts/date basis were preserved. An old Trial agency retained access.
- Production dependency audit reported 0 known vulnerabilities. Whitespace/conflict checks passed; no Cloudflare deployment/runtime files were added.

Provider tests use fictional data and mock transports; they do not establish live provider approval or production readiness. No actual Render database backup, schema inspection, migration or hosted release was performed in this workspace.

## Implementation map

| Area                          | Main files                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Existing CRM and PDF          | `src/components/workspace.tsx`, `src/lib/actions.ts`, `src/lib/sales-flow.ts`                                                    |
| Advanced metrics              | `src/components/advanced-analytics.tsx`, `src/lib/kpi-service.ts`, `src/lib/reporting-time.ts`, `src/app/api/analytics/route.ts` |
| Assistant and manual WhatsApp | `src/components/travel-assistant.tsx`, `src/lib/assistant.ts`, `src/lib/ai-provider.ts`, `src/lib/whatsapp.ts`                   |
| Accounts and roles            | `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/access.ts`, `src/lib/invitations.ts`, `src/components/security-settings.tsx`   |
| Subscription review           | `src/components/subscription.tsx`, `src/lib/subscription-requests.ts`, `src/lib/subscriptions.ts`, `src/components/admin.tsx`    |
| Advertising connections       | `src/lib/integrations/`, `src/components/integrations.tsx`, `src/app/api/integrations/`                                          |
| Official messaging            | `src/lib/messaging/`, `src/components/messaging.tsx`, `src/app/api/messaging/`                                                   |
| Automation                    | `src/lib/automation/service.ts`, `src/components/automation.tsx`, `scripts/automation.ts`                                        |
| Tour                          | `src/components/guided-tour.tsx`, `src/lib/tour-service.ts`, `src/lib/tour-steps.ts`                                             |
| Backup and migration          | `scripts/secure-backup.ts`, `scripts/rehearse-render-upgrade.ts`, `prisma/migrations/`                                           |
| Theme                         | `src/app/globals.css`                                                                                                            |
