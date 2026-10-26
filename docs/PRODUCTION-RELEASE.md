# TravelOS 0.2 release and client-launch gate

This release strengthens the application for a **small-agency paid pilot**. It does not assert independent security certification, legal compliance or verified production operations. Code changes, live credentials/services and client onboarding are separate steps.

## What changed

- Tenant composite foreign keys protect user assignment, quotations, bookings, activities and transactions even if an application query omits a tenant check. Mutations re-read current role/disabled state.
- Better Auth uses PostgreSQL-backed shared auth limits; application reads/writes use atomic shared request counters. Streamed request sizes are bounded. Browser-origin checks, no-store private responses and security headers are enabled.
- New payments require a per-submission UUID. Identical retries return the existing result; changed payloads cannot reuse the key. Permission checks still run before replay responses. Legacy ledger rows are preserved.
- Supplier credits can reverse paid costs, and explicit supplier refunds settle the resulting cash receivable. Payments/refunds are not counted twice as expenses.
- Verification emails, password reset, session revocation and hashed, one-use, expiring team invitations are implemented. Owners no longer create teammates' passwords.
- Authenticator-app MFA and one-use recovery codes are supported. `/admin` requires an allowlisted verified email, MFA enabled, and a server-recorded successful second-factor challenge within 4 hours. Agency ownership alone cannot grant this access.
- New agencies get a 14-day trial. Starter allows 3 active/reserved seats and 3,000 enquiries; Growth 10 / 10,000; Professional 25 / 25,000. Pending unexpired invitations reserve seats. Inactive subscriptions retain read/export access and block business writes. These are product limits, not tested scale guarantees.
- AES-256-GCM encrypted PostgreSQL backups, checksum checks and isolated local restore tests are available. Least-privilege runtime role provisioning, health/launch checks, CI and maintenance commands are included.

## 1. Preserve live data before migration

Your existing Render database was not backed up by this coding task. Local restore tests used fictional demo data only. First obtain a private verified backup of the actual Render database and copy it to separate storage. See BACKUP-RUNBOOK.md. Confirm your database's expiry/paid retention in Render; the previous Free instance showed **23 November 2026** expiry.

These migrations are additive and were tested locally on existing and fresh schemas. They enforce tenant consistency and will refuse inconsistent existing records rather than move them between agencies. Validate a restored staging copy first. Do not reset or reseed a real agency as a migration workaround.

## 2. Email without buying a domain

A custom website domain is optional; your HTTPS `onrender.com` origin is supported. Gmail SMTP can use your own account without a custom domain, **provided the hosting plan permits outbound SMTP**. Check Render's current Free-service restrictions before relying on ports 465/587. For a paid pilot use an appropriate hosting plan, or an HTTPS email provider with its sender requirements. Resend usually needs a verified sender domain for general client delivery; its test sender is not a production substitute.

Gmail setup:

1. Open your Google Account → Security → enable 2-step verification.
2. Open Google's App Passwords settings. If your account policy offers it, create an app password specifically for TravelOS. Normal Gmail passwords must not be used.
3. In Render **Web Service → Environment**, securely add:

| Key | Value |
|---|---|
| `BETTER_AUTH_URL` | Your exact HTTPS application origin |
| `BETTER_AUTH_SECRET` | Keep the existing strong secret stable; never replace it with an example |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | Your own Gmail address |
| `SMTP_PASS` | The Google App Password, entered only in secret settings |
| `MAIL_FROM` | That Gmail address, optionally with your verified display name |
| `SUPPORT_EMAIL` | Your support email address |
| `PLATFORM_ADMIN_EMAILS` | Your own operator account email, comma-separated if necessary |

4. Run `npm run mail:check` from a trusted configured environment. It verifies SMTP connection/authentication without sending mail. This task did not test live Gmail delivery.
5. Test a verification email and password reset to **your own** account. Confirm inbox/spam delivery and correct HTTPS links. Enable `REQUIRE_EMAIL_VERIFICATION=true` only after that works. Existing unverified accounts must verify before accessing records; their records are not deleted.
6. If Google App Passwords are unavailable or SMTP is blocked, choose a supported mail service/hosting plan. Do not disable TLS verification, borrow a sender identity or paste secrets into chat.

## 3. Apply migrations with controlled credentials

- Migration job/operator: set `MIGRATION_DATABASE_URL` to the database-owner URL, then run `npm ci`, `npm run db:generate`, `npm run db:migrate`.
- Keep owner credentials in a controlled release job/operator environment, **outside the public web runtime**.
- The database administrator can run `npm run db:provision-runtime` once with `APP_DB_PASSWORD` (separate random 32+ character secret) and optional `APP_DB_USER=travelos_app`. It creates only a LOGIN/DML role, never prints passwords and refuses to overwrite an existing role.
- Set the web service `DATABASE_URL` to the same database using that runtime role and its private password. Verify native provider TLS requirements; do not append `rejectUnauthorized=false` or use an unverified TLS mode.
- Runtime build command after controlled migration: `npm ci --include=dev && npm run db:generate && npm run build`. Start: `npm run start`. Do not run schema-owner migrations or grant DDL powers in the web runtime.
- If future migrations add tables, explicitly review/apply their runtime grants. Do not grant all future objects blindly. Demo seed is optional, remains isolated and should run in the controlled setup job.

This split is an operational prerequisite; this task did not reconfigure your live Render credentials, plan, network rules or database roles.

## 4. Set up the service operator

1. Sign in with your allowlisted email; verify the email.
2. Settings → Two-factor authentication → Set up authenticator app. Enter the current password, add the private setup key to your authenticator, save recovery codes privately, and confirm the six-digit code.
3. Open `/admin` on your deployed origin. Other agency owners cannot access this page.
4. After arranging/invoicing payment separately, choose the agency, plan, Active status and explicit paid-validity days. Save access. No funds are processed.
5. After 4 hours, verify the authenticator again when prompted. CLI administration remains available to a trusted operator with direct DB access: `npm run subscription -- <agency-id> Starter Active 30`.

## 5. Launch checks

- `npm run check:launch` must pass with the actual runtime connection and settings.
- `/api/health/live` is liveness only. `/api/health/ready` returns 503 until required configuration, security tables, least-privilege role and a verified/MFA-enabled operator exist. Its response never lists secrets.
- A green readiness check is **not** a proof of email delivery, backup scheduling, accounting correctness, capacity, legal compliance or an independent security review.
- Verify on staging: email signup/verification/recovery; MFA/recovery code; private agency A/B attacks; team invitation recipient/revoke/expiry; role/disable controls; booking + partial receipt + refund; paid supplier credit/refund; filtered exports and reports; trial expiry/read-only behavior; operator renewal.
- Set monitored backups/restore retention, uptime/error alerts, incident contact, support hours and a reviewed written service/privacy agreement. Keep demo data separate.
- Run the new GitHub Actions checks. The workflow is provided, but its hosted run was not verified in this task. Do not deploy a failed build or migration.

## Limits still requiring review

The UI still loads a permitted agency dataset into the browser; server pagination and high-volume/load testing remain work before large agencies. Record caps are safeguards, not capacity benchmarks. Browser coverage is Chromium; full Safari/Firefox/device/screen-reader review is outstanding. Reports show the **current state of date cohorts**, not immutable historical month-end accounting. This is an operational ledger, not GST/TCS filing or audited net-profit reporting. Independent security, legal/privacy and accountant review remain external launch gates. The synthetic model remains explicitly unvalidated on real agencies.

## Rollback safety

Do not roll back to the original password-only MVP after people enable MFA: that old code does not enforce the new second factor. Prefer a tested forward fix or maintenance mode, and keep only MFA-compatible releases as rollback candidates. Do not drop security constraints/tables, reset customer records or reuse an unverified old database dump as an automatic rollback. Test any application/database rollback together on an isolated copy and plan operator recovery keys before cutover.
