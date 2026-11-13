# Hotel foundation verification — 13 November 2026

All runs used the local PostgreSQL environment/disposable local databases and fictional accounts. No production deployment, real payments or outbound customer messages were performed.

- Existing + new server/unit/integration suite: **61 passed, 0 failed**.
- Existing + new production-browser suite with HOTELS_ENABLED=true at runtime: **23 passed, 0 failed**.
- Production build: passed with the feature off and with HOTELS_ENABLED=true. The feature-enabled staging build also passed 3 targeted owner/SEO/navigation browser checks (including mobile public navigation).
- Migration rehearsal: **19 migrations**, success for fresh, original and current schema paths; existing sales records/versions/trial behavior preserved.
- Feature-off smoke: hotel owner page renders framework not-found; both new hotel API families return HTTP 404; existing health route remains available. Next streamed not-found pages may have HTTP 200 with a not-found document; authorization is enforced by the API/service, not that page status.
- Fictional desktop/mobile owner and platform-review previews saved in ignored `.local/design/hotels/`. Preview operator sessions are controlled fixtures; real MFA authentication is covered by the existing operator/MFA regression suite, not claimed from screenshots.

New service tests cover independent hotel ownership even within the same agency, foreign hotel/category rejection, viewer writes, invalid occupancy/tax/fields, unverified/disabled users, exact HTTPS media-host allowlisting, profile revision races (one writer wins), atomic audit rollback, owner self-review rejection, explicit business-verification attestation, stale review rejection, review/reject/resubmit/suspend transitions and unexpected-error redaction. Existing requireOperator tests continue to cover session/MFA proof enforcement.

New browser test covers the shared signup destination, email-verification gate, hotel draft, category creation, review submission, audit history, cross-hotel request refusal, ordinary-owner admin refusal, cross-origin mutation rejection and mobile overflow. No inventory booking, payment webhook, refund or hotel-chat test is claimed: those implementations do not yet exist in this stage.

The migration was applied only to the local development database. A deployment still requires staging acceptance, a migration/permissions review and explicit production approval. The hotel feature defaults to disabled.
