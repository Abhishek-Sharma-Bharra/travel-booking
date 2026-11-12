# Client launch checklist

The 0.2 code release adds production foundations. **Do not hand over a real-data paid pilot solely because it builds.** Complete the live operational gates in [PRODUCTION-RELEASE.md](PRODUCTION-RELEASE.md).

## Implemented and verified locally

- [x] Server tenant/role checks plus composite tenant database foreign keys.
- [x] Shared auth/application request limits, streamed request bounds, private responses and browser security headers.
- [x] Email verification, one-time password reset and revocation of old sessions (delivery mocked in tests).
- [x] Secure expiring recipient-bound invitations; plan seats and 14-day trial/write restrictions.
- [x] Authenticator and recovery codes; allowlisted/verified/MFA-proven subscription operator page.
- [x] Idempotent financial submissions; paid supplier credit/refund correction workflow.
- [x] Encrypted backup, integrity checks, isolated local restore and least-privilege role provisioning tools.
- [x] Typed build, regression/access/security tests and Chromium browser flows; CI workflow supplied.
- [x] Operator, onboarding, privacy/service-summary and recovery documentation.

## Required outside actions before real client handover

- [ ] Back up the **actual Render database**, restore a separate staging copy and validate migrations there.
- [ ] Choose hosting/database plans suitable for the commitment; confirm persistence, capacity, uptime and backup retention. The previous free database showed 23 November 2026 expiry.
- [ ] Configure real email secrets securely; test actual verification/reset/invitation inbox delivery. Enable `REQUIRE_EMAIL_VERIFICATION=true` after delivery works.
- [ ] Configure operator email allowlist, verify that account, enable app MFA and store recovery codes privately.
- [ ] Run the web app with a least-privilege DB user and keep owner credentials in a controlled migration job.
- [ ] Set monitored encrypted/offsite backups, restoration ownership, recovery objectives and alerts. Provided commands do not create a scheduler or storage account.
- [ ] Run `npm run check:launch` with the actual runtime environment; configure monitoring. A ready health response is a configuration check, not an independent audit.
- [ ] Obtain independent access/security review and accountant review of your manual financial workflow.
- [ ] Complete provider legal identity/contact, privacy/data-processing terms, retention/deletion policy, pricing/taxes and signed client order with appropriate advisers.
- [ ] Finish representative load, Firefox/Safari/device and accessibility review before expanding beyond a small controlled pilot.

Reports remain current-state cohort reports, not immutable closed-period accounting. ML remains explicitly synthetic/unvalidated. No live billing, payment transfer, identity-document upload or automatic model retraining is included. No production mail/backup/account reconfiguration or paid infrastructure purchase was performed by this coding task.
