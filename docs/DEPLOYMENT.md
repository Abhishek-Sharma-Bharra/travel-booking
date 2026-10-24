# Deployment, backup and restore

No deployment has been performed and no public URL exists yet. The app needs a Node.js 24 host and PostgreSQL; it does not require a paid ML API, payment processor or outbound email to run the demo.

## Deploy on a Node-capable managed host

1. Push the committed repository to your GitHub repository using your normal credentials. This task commits locally but does not push or provision external hosting.
2. Create a PostgreSQL 17 database with persistent storage, restricted network access, encryption and scheduled backups. Create a dedicated least-privilege application user. Use your provider's TLS connection instructions; retain certificate verification. Do not use the development password.
3. Import the GitHub repository into a host that supports Next.js and Node 24 (for example Vercel, Render or an equivalent Node service). Use the repository root.
4. Set these private environment variables in the host's settings:
   - `DATABASE_URL`: provider's PostgreSQL connection URL, including the provider's required TLS configuration.
   - `BETTER_AUTH_SECRET`: a unique random secret of at least 32 characters. Keep it stable between deployments; rotating it invalidates sessions.
   - `BETTER_AUTH_URL`: the exact HTTPS application origin, with no extra path. The write endpoint's CSRF protection and Better Auth use this trusted origin.
5. Install with `npm ci` including development dependencies during the build/release step. Run `npm run db:generate`. In a single controlled release job, run `npm run db:migrate` against the target database. Do not run competing migrations in parallel on every server instance.
6. Run `npm run db:seed` once if you want the isolated demo on this deployment. It only inserts its reserved demo agency and never modifies real agencies. If you do not seed, `/demo` intentionally shows an error; all private workspace features still work.
7. Build with `npm run build`. Start a persistent Node service with `npm run start` (defaults to port 3000; set `PORT` to the host's assigned port). A Next.js managed platform uses its own standard start convention.
8. Configure your custom domain and HTTPS, update `BETTER_AUTH_URL` to match, and restart. Never trust an arbitrary Host header as the CSRF allowlist. If a proxy rewrites internal addresses, the configured public origin must still match the browser Origin.
9. Check the home and demo routes, create a disposable agency, add a package and complete an enquiry → quotation → booking → partial receipt flow. Confirm unauthenticated `/api/data` returns 401 and a foreign Origin write returns 403. Remove test data through your documented operator process.

The runtime performs JavaScript coefficient inference; Python is only a developer tool for explicit model regeneration. Keep the generated Prisma client and `ml/model.json` in the build artifact. Do not omit build-time packages before generation/migration. The version-pinned WASM migration helper is documented in the root README; conventional Prisma CLI commands are available if native-engine network access is allowed.

## Local development database

`npm run db:start` reuses/starts `travelos-postgres` or runs `docker compose up -d db`. A named Docker volume persists development data between container restarts. It is not a backup, and it is not guaranteed to survive a cloud environment snapshot/rebuild. Never run `docker compose down -v` on data you want to keep.

## Backup

For the local container:

```bash
npm run db:backup
```

This writes a PostgreSQL custom-format dump into ignored `.local/backups`, and checks its table of contents. Copy it securely to separate storage. A dump contains customer data and hashed auth records: treat it as private, encrypt it, restrict access and implement retention/deletion policies. Dumps and `.env` must never be committed. Before publishing a cloud snapshot containing non-demo work, take an explicit backup; snapshotting code and installed dependencies is not a substitute for database recovery.

For production, configure provider-managed backups and point-in-time recovery. Agree recovery time and acceptable data-loss objectives; monitor backups and test a restore regularly in isolation.

## Restore into a separate database

Do not restore blindly over a running production database. For a local recovery exercise with an existing dump file:

```bash
docker exec travelos-postgres createdb -U travelos travelos_restore
# Replace the file below with the actual backup you created.
docker exec -i travelos-postgres pg_restore -U travelos -d travelos_restore --no-owner < .local/backups/your-backup.dump
```

Set `DATABASE_URL` in a separate test shell/environment to point to `travelos_restore`, generate the client and run appropriate read-only verification. Inspect agency/lead/booking/transaction counts and balances; test sessions only in a disposable deployment using its own origin and secrets. Check migration status before accepting writes. Switch application traffic only after validation and an explicit operator decision. Provider-hosted restores should follow the provider's exact documented steps.

## Services and cost categories

| Service | Why it is needed | Cost category |
|---|---|---|
| Next.js hosting | Runs UI, authenticated routes and server validation | Compute, memory, bandwidth and build usage |
| PostgreSQL | Persistent tenants, sessions, sales and ledger | Database compute/storage, backups and connections |
| Domain / DNS / TLS | Public HTTPS identity | Domain registration and optional managed certificates |
| Backup storage | Recovery independent of the application server | Encrypted storage, requests and retention |
| Monitoring / logs | Errors, uptime and incident diagnosis | Ingestion and retention |
| Optional email provider | Future invitations, verification and password recovery | Message volume and deliverability services |

No current provider prices are assumed. ML inference, demo data and manual subscriptions require no paid API. There is no payment-processing or live SaaS billing integration.
