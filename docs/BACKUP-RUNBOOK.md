# Encrypted backup and restore runbook

Code on GitHub is not a backup of customer data. Render volumes, free service state and application processes are not independent backups.

## Requirements

A trusted operator machine with Node 24, this release's dependencies, and Docker (default PostgreSQL 17 tools) or native PostgreSQL 17 tools (`BACKUP_PG_MODE=native`). The source database must be reachable from that machine. Use the provider's **External Database URL** for operator backups; keep it in a private environment variable, never in chat, committed files or command arguments.

Required private settings:

- `BACKUP_DATABASE_URL`: external source URL, preferably a dedicated backup user.
- `BACKUP_ENCRYPTION_KEY`: a separate random 32+ character secret, stored securely outside the backup archive. Never reuse `BETTER_AUTH_SECRET`. Losing the key makes encrypted backups unrecoverable.
- `BACKUP_DIRECTORY`: optional private backup folder; default `.local/secure-backups` is ignored by Git. A cloud workspace folder alone is not offsite storage.

For remote PostgreSQL, the tool requires verified TLS (`verify-full`, system certificate roots by default). Configure the provider's authoritative CA/root trust when required; never disable verification. `PGSSLROOTCERT` custom paths must be valid in the selected native/container environment. Local development connections use local PostgreSQL without TLS; do not use an untrusted tunnel as a production backup endpoint.

## Create and validate

```bash
npm run backup:secure
npm run backup:verify -- /private/path/to/travelos-....dump.enc
```

The tool streams `pg_dump` into AES-256-GCM encryption, writes a SHA-256 manifest, then decrypts into a private temporary file and checks PostgreSQL's archive catalogue. Credentials are not printed. The temporary plaintext is removed. A failed dump never gets promoted from `.partial` to a completed backup. Retain the `.enc` file and its `.json` manifest together; copy them to private offsite storage with access controls. The encryption key belongs in a separate password manager/secret store.

Authentication and catalogue checks are necessary but **not a full restore test**. The tool never reports offsite upload or scheduling that it did not perform.

## Full isolated restore drill

Set `DATABASE_URL` to a **local development PostgreSQL server** and run:

```bash
npm run backup:restore-test -- /private/path/to/travelos-....dump.enc
```

It checks the manifest and GCM authentication first, creates a random separate database, restores the archive, checks agency/enquiry/booking/ledger tables, then removes only that temporary database. It refuses a non-local restore target and never overwrites the source database. Operators must separately review balances, login and representative workflows on an isolated restored deployment using test-specific credentials and HTTPS origin.

For hosted disaster recovery: have your database administrator restore into a new isolated provider database, validate records/migrations/access and only then explicitly switch application traffic. Do not pipe unverified plaintext directly into production or restore over the running database.

## Schedule, retention and incident ownership

Before a paid pilot, record **who** runs backups, **where** independent encrypted copies live, **when** failures alert, the retention policy and the supported recovery/data-loss objectives. A reasonable policy to assess is daily backups, 30-day retention and a weekly restore rehearsal, but do not promise it until actually configured, monitored and tested. Provider-managed backups/PITR depend on the chosen Render plan; inspect actual plan features and retention.

This repository provides backup tools, not a provisioned backup scheduler/storage account. Paid infrastructure changes must be reviewed by the owner. Windows operators can use Task Scheduler; Linux operators can use an existing trusted scheduled runner. Keep credentials in the runner's secure environment and copy completed files offsite; an ephemeral Render web filesystem is not a backup destination. No production backup or production restore was performed by this coding task.

## Authentication keys and temporary files

Keep the stable `BETTER_AUTH_SECRET` in a separately recoverable secret store: existing MFA secrets are encrypted using it. Recovering the database without that secret can leave existing authenticator records unusable. Plan any rotation/re-enrolment explicitly. Never copy real recovery links/codes into support chats. Isolated restore tests must not send email to real customers or expose restored sessions publicly; use fixture accounts and blocked outbound mail. Production cutover requires the correct original auth secret and reviewed session handling.

The tool removes private temporary plaintext on normal completion/failure. A machine/process crash can leave a private temporary folder; use an encrypted operator disk and review/remove abandoned `travelos-backup-*` / `travelos-restore-*` folders according to the recovery policy.
