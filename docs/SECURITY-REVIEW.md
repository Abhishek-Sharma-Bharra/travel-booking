# Engineering security review — TravelOS 0.2

This is an implementation review and automated verification record by the coding assistant, **not an independent penetration test or security certification**. The live Render database, mail credentials, network rules, backup scheduler and deployment permissions were not accessible to this task.

| Boundary | Mitigation / local evidence |
|---|---|
| Agency isolation | Composite tenant foreign keys for assignments and business relations; server DB-backed actor and scoped queries; direct-SQL and HTTP cross-agency attacks rejected |
| Role changes / disabled users | Mutations re-read current roles; requests re-read user state; disabling revokes sessions; owner input cannot select an arbitrary workspace |
| Operator access | Separate email allowlist, verified email, authenticator enabled, and a server-recorded successful MFA challenge within 4 hours; stale pre-enrolment session rejected; tenant Owner is insufficient |
| Accounts / recovery | Better Auth handles password hashing, signed cookies, verification, expiring reset links, reset-token consumption and session revocation; actual library flows tested with mocked email delivery |
| MFA / recovery | TOTP and single-use backup codes use the established library; successful challenge is required before privileged session proof is written; enrolment/login/recovery-code replay tests pass |
| Team onboarding | Random 256-bit invitation secret; only SHA-256 digest stored; recipient email, expiry, status, plan seats and existing-workspace preservation checked transactionally; owner does not choose member password |
| Browser requests | Trusted configured origin, streamed body bounds, private no-store responses, frame/object/form restrictions and referrer policy; no raw secrets in generated setup instructions |
| Rate limiting | Shared PostgreSQL authentication limits and atomic read/write windows; concurrent requests tested; deployment still needs platform/proxy-aware edge abuse protection |
| Money / retries | Integer paise and exact tax rounding, positive DB amounts, one submission ID/hash per financial operation, permission checks before replay results, supplier-specific caps and explicit credit/refund cash settlement |
| Database privileges | Provisioner creates DML-only runtime role; local test confirmed reads work and DDL is denied; migration-owner credentials must be separated operationally |
| Backups | AES-256-GCM authenticated encryption, private temporary files, checksum + archive checks, refusal to overwrite live DB, isolated restore tested locally; key/offsite/schedule ownership remains operational |
| Logging | Auth logs contain event level rather than raw payloads; mutation logs contain safe classification only; SMTP/provider errors are sanitized. Hosting access logs/proxy retention still need review |
| Dependencies | Lockfile-based install; runtime vulnerability audit reported no known advisories at check time. Dependency scanning is not a proof of security |

## Findings requiring outside confirmation before real client data

1. Configure actual verified email delivery. No domain is required for the supported own-account Gmail SMTP option, but the host must permit SMTP and the Google account must support App Passwords. Never substitute a borrowed/test sender for general client delivery.
2. Back up the actual live Render database, rehearse recovery on an isolated copy, activate monitored retention/offsite storage, and avoid free-plan expiry. Local demo backups are not live customer backups.
3. Separate the database owner/release credentials from the web runtime, review external-IP rules, enforce verified provider TLS and run staging migration checks.
4. Review support/privacy/legal identity and a signed pilot agreement; do not invent service-level guarantees or statutory accounting compliance.
5. Arrange an independent review of authentication, authorization, exports, operator access and hosted configuration. Enable MFA on GitHub, Render, mailbox and backup storage as well as in the app.
6. Test representative agency volume and browsers before promising capacity. The client still loads its permitted dataset; record caps are not a substitute for server pagination or a load test. A strict nonce-based script CSP and broader accessibility/device review are follow-up work.

No revenue lift, guaranteed business outcome, production certification or real-world model validity is claimed. The intended initial rollout is a controlled small-agency pilot after the external gates are fulfilled.
