# Before charging for a live deployment

This working MVP is suitable for an honest, fictional-data sales demonstration. Passing checks and a successful build do not make it production-ready.

- [ ] Deploy to an HTTPS origin with private PostgreSQL, separate staging/production databases and strong secrets. No public deployment was performed in this task.
- [ ] Perform independent server access-control review, including every read/write/export and assignment change; consider PostgreSQL row-level security or composite tenant foreign keys as defence in depth.
- [ ] Configure email verification, owner recovery/password reset and a secure member-invitation workflow. Current signup has no email verification or self-service recovery. Create initial member passwords securely and require a change operationally.
- [ ] Configure shared persistent auth rate limiting for multi-instance deployments and mutation/API request-size limits. Default auth limits are per instance; the application mutation route does not have a distributed limiter.
- [ ] Arrange monitored encrypted backups, point-in-time recovery, retention and a documented restore rehearsal. Docker volumes are not backups.
- [ ] Review legal terms, privacy notice, customer consent, export/deletion process and handling of contact information with appropriate advisers.
- [ ] Review money limits, cancellation policies, tax-inclusive value, statutory tax treatment, accounting reconciliation, refunds and correction approvals with an accountant.
- [ ] Add supplier refund/paid-credit correction workflows if needed. Current append-only ledger is an operational record, not a general accounting system.
- [ ] Agree manual subscription administration and service terms. Stored plans/status do not enforce quotas or charge a card.
- [ ] Set up alerts, structured redacted logs, incident response, migration ownership and database connection pooling for the chosen host.
- [ ] Run a security dependency audit and patch supported package versions before release. Pinned internal Prisma helper APIs need deliberate upgrade testing.
- [ ] Run cross-browser/mobile, keyboard focus, screen-reader, print-output and high-volume/load reviews. Dialog focus trapping and server-side pagination are not yet implemented.
- [ ] Evaluate the model on timestamped, consented real agency data before using it operationally. Until then retain the synthetic-model warning and human review.
- [ ] Define whether clients need historical month-end reporting; current reports recompute the present state of the selected cohort.

No hosting or other external account is provisioned by the application. No claim of production readiness, validated forecasting, improved conversion or business savings is made.
