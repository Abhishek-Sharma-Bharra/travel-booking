# Vashisht TravelOS

A working SaaS MVP by **Vashisht Analytics** for small and medium travel agencies in India. English UI, INR, calendar travel dates, Indian date displays. PostgreSQL stores agency records; the isolated, read-only demo needs no account or paid API.

## Production foundations (0.2)

Start with [the release and Gmail/Render setup guide](docs/PRODUCTION-RELEASE.md), [encrypted backup runbook](docs/BACKUP-RUNBOOK.md), [security review](docs/SECURITY-REVIEW.md) and [first-client onboarding guide](docs/CLIENT-ONBOARDING.md). The new version has verification/recovery, safe email invitations, authenticator MFA, an operator subscription page, shared request limits, database tenant constraints, payment replay protection and encrypted recovery tools. Live email, hosted backup monitoring, least-privilege credentials and an independent review still need operator setup. A custom website domain is optional.

## Start here

You need **Node.js 24 LTS**, npm, and Docker Desktop / Docker Engine with Compose. Python 3.12 is only needed to retrain the demonstration model. An external PostgreSQL 17 database can replace Docker.

From this repository's directory:

```bash
cp .env.example .env
```

Edit `.env`: replace `BETTER_AUTH_SECRET` with a fresh random value (at least 32 characters). Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Keep it private. The example database password is for a local development database only. If you change it, also set `POSTGRES_PASSWORD` for Compose and update `DATABASE_URL` to match.

```bash
npm ci
npm run db:start
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open the address printed by Next.js, then choose **Explore Demo**, or visit the `/demo` route. **Create your agency** starts an empty, private workspace. No demo login credentials are needed. The environment prepared during implementation already has `.env`, dependencies and the seeded development database; run `npm run db:start` and `npm run dev` to resume.

The seed creates exactly 1,500 fictional enquiries and 330 bookings in the six completed calendar months before its first run. It includes 30 cancellations, refunds, partial collections, supplier costs, ad spend and operating expenses. It is deterministic for that month anchor and idempotent: rerunning it leaves existing data untouched. No real names or customer contacts are used. Set date filters to the seeded months if revisiting an older snapshot.

### How to demonstrate it

Read [the demo guide and three-minute script](docs/DEMO.md). Start with Overview, filter a destination, inspect an enquiry, view its quotation, review customer/supplier balances and finish with Monthly report. Browser print offers **Save as PDF**. The demo cannot save changes; its ML scenario calculator runs only in memory.

### Onboard the first agency

1. Create an account with the owner's work email and a unique 12+ character password.
2. Open **Settings → Edit agency profile**. Add agency name, contact details, optional HTTPS logo URL and quotation footer.
3. Configure email first, then invite members from Settings. Recipients verify/sign in with the invited email, choose their own password and accept the one-time link. Owners do not choose or share member passwords.
4. Create packages with inclusions, exclusions, selling price and estimated supplier cost per person.
5. Add enquiries or download the CSV template from **Enquiries → Import CSV**. Replace sample fields, use active teammate IDs displayed in the importer, inspect row errors and confirm import.
6. Build a quotation from an open enquiry; accept it to create one booking. Record receipts and actual supplier expenses separately. Record supplier payments against the same supplier name.
7. Record monthly ad and operating spend. Review follow-ups, current balances and the monthly report with the client.
8. Agree subscription and onboarding terms outside the app. A trusted database operator updates metadata using `npm run subscription -- <agency-id> Growth Active 30`. This collects no money; plan limits and subscription write access are enforced. The verified/MFA-proven `/admin` page offers the same manual administration without a terminal.

## Technology and checks

Next.js **16.4.3**, React 19, TypeScript, Tailwind CSS 4, PostgreSQL 17, Prisma **7.10.1**, Better Auth **1.7.12** (email/password, hashed passwords and server sessions), Zod and Playwright. Exact resolved dependencies are in `package-lock.json`; use `npm ci`. Official package metadata, the Next.js documentation shipped in its package, and Better Auth's official Prisma-adapter source documentation were checked during implementation. Some hosted documentation domains were restricted in the cloud environment.

```bash
npm run typecheck
npm test                  # unit + real PostgreSQL integration tests; demo seed required
npm run build
npm run test:e2e           # starts a dev server if needed
```

Browser tests use `/usr/bin/chromium` when available, or `CHROMIUM_PATH` if set. Otherwise install the matching browser with `npx playwright install chromium`. Linux may need `npx playwright install-deps chromium`. Browser downloads require network access to Playwright's distribution domains. Tests create and remove their own isolated fictional agencies; use a development database, never a production database.

Tests cover server and database tenant/role attacks, atomic bulk CSV imports, quote-to-booking conversion, exact money/refunds, supplier correction balances, request replay, subscription limits, recovery tokens, authenticator/recovery codes, privileged operator proof, encrypted backup integrity and 80 Python/TypeScript inference comparisons. Browser coverage exercises demo navigation, mobile navigation, filters, search, pipeline, export, print previews, signup, login, logout and the enquiry-to-receipt workflow. See [verification](docs/VERIFICATION.md) for executed outcomes.

### Prisma in restricted networks

This environment blocks the native engine host `binaries.prisma.sh`. `db:generate` and `db:migrate` use the exact version-pinned Prisma JS generator / WebAssembly schema engine and official PostgreSQL adapter obtained through npm's integrity-checked registry. No TLS or checksum verification is disabled. Migration SQL and Prisma's migration history/checksums are retained. These helper entry points use internal Prisma APIs; update them deliberately alongside the pinned Prisma packages and run the full checks. Standard `npx prisma generate` and `npx prisma migrate deploy` remain alternatives where native-engine downloads are available. Do not rerun `scripts/migrate.ts --initial` on a maintained checkout; it exists only to explain initial schema generation.

## Financial and model methodology

[Financial methodology](docs/METHODOLOGY.md) explains every KPI, attribution, date cohorts and cancellation treatment. This is a manual operational ledger, not a payment gateway, tax filing system or audited accounting package. Contribution is **not net profit**. Optional tax inputs are commercial quotation inputs; consult an accountant for GST, TCS, tax liability and revenue recognition.

The [synthetic ML pipeline](ml/README.md) is a real trained logistic regression, exported for inference without a Python server. It is **“Demo model — not validated on your agency”**. No uploaded files trigger training, and no accuracy or business impact on real agencies is claimed.

## Deploy, back up and operate

See [deployment and recovery](docs/DEPLOYMENT.md), [feature status](docs/FEATURES.md) and [production readiness](docs/PRODUCTION.md). The owner has deployed the app at **https://vashisht-travelos.onrender.com**. Deployment authentication is being checked; this cloud workspace cannot independently reach the public host. You can deploy to a Node-capable host with a managed PostgreSQL database. Docker development volumes and running processes should not be assumed to survive a cloud environment rebuild; reseed a disposable demo, or restore a verified backup for non-demo data.

No payment processing, subscription billing, external AI service, passport upload or identity-document collection is included.

### Sales & operations assistant (review release)

Today's priorities, structured customer-message drafts, package-based itinerary/quote review, explicit quotation approval/versioning, multilingual copy-only follow-ups and an owner's briefing build on the existing workflows. Live extraction is optional and server-only; the public demo uses a labelled fictional sample. See [configuration, review steps and limitations](docs/AI-SALES-ASSISTANT.md). No automatic customer communications or production deployment are included.
