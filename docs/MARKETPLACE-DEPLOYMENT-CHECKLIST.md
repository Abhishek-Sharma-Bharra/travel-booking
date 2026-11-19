# Marketplace deployment checklist

This release adds code and migrations; development does not authorize live financial processing. Despite “staging” resource names, the Worker serves the user-facing Pages origin: treat it as production.

## Before deployment

1. Review `MARKETPLACE-IMPLEMENTATION.md`, migrations `0005_b2b_marketplace.sql` and `0006_verified_referrals.sql`, test evidence and commercial terms with the operator. All migrations are additive; four proposed plan prices are seeded only into new tables. Existing customers are not charged or migrated to new prices.
2. Verify a recoverable D1 Time Travel bookmark/export. Keep the existing release script's restore-point check. Record the current Worker version, Pages deployment and Git revision. Do not overwrite production with local fixtures/demo customer data.
3. Rehearse in disposable LOCAL D1 with `npm run d1:migrate:local`; run `npm test`, `npm run typecheck`, `npm run cloudflare:build` and `npm run test:e2e:cloudflare`. Browser tests use local fixture SQL only, never remotely.
4. Set production `PLATFORM_ADMIN_EMAILS` to the real operator allowlist; verify email and complete actual Better Auth MFA enrollment/recent challenge. Never grant admin/MFA/verification by SQL in production.
5. Confirm `BETTER_AUTH_SECRET`, canonical `BETTER_AUTH_URL` and `PUBLIC_SITE_URL` match the established origin. Configure verified email delivery with `MAIL_FROM` and `RESEND_API_KEY` for real business verification; keep secrets out of Git/chat.
6. Keep `PAID_AI_ENABLED=false`, `HOTEL_LIVE_PAYMENTS_APPROVED=false`, `WHATSAPP_LIVE_SEND_APPROVED=false`, `WHATSAPP_PROVISION_APPROVED=false`. Do not connect paid APIs or assume Razorpay Route/settlement eligibility. Hotel test checkout requires explicitly configured TEST credentials and encryption keys; it is never a real confirmation.

## Approved rollout

7. After approval, build the same reviewed revision for Pages and Worker. Existing Worker build: `npm run db:generate && npm run cloudflare:build`. Existing release: `npm run cloudflare:release:worker` (restore bookmark check → pending remote D1 migrations → existing fictional demo preparation → Worker deployment). Review its existing demo seed behavior; it must remain restricted to the designated fictional demo tenant. No new real customer migration is needed.
8. Apply both new D1 migrations BEFORE deploying the new Worker: the hotel capture path now atomically updates linked marketplace bookings. With existing automatic release hooks this happens in the release script. Do not deploy the new Worker without its schema. Pages output remains `cloudflare/pages-dist`; keep its private backend binding and origin checks.
9. Validate the live build outcome and uploaded bundle against the account's actual Free-plan limits. No paid upgrade is performed by this code. Monitor actual Worker CPU/error rate, D1 reads/writes/storage and free-tier quota warnings in Cloudflare; app counters are not a billing estimate.
10. Smoke-test home, existing agency signup/CRM/reports, hotel onboarding/holds, operator draft, approval, accepted contract, vehicle calendar, charter request, confirmation as UNPAID, protected admin and CSV exports. Use fictional test data and a separate browser for each role; verify unauthorized access fails.
11. Configure business-approved prices/quotas/sharing in `/admin/marketplace`. Obtain supplier acceptance before listing. Verify bilateral referral contracts before granting exemptions. Manual subscription activation and payment/refund/settlement records require independently checked external evidence. These controls never move money.

## Rollback and operations

- If runtime code fails, redeploy the recorded previous Worker/Pages versions; additive tables can remain. Do not drop ledgers or restore over live customer writes without a separate recovery decision. Keep new financial records even during a code rollback.
- A hold expires after 15 minutes by effective state/capacity queries, even without a scheduled write. Owner calendars/booking screens reflect effective expiry; raw historical HELD rows may persist until explicitly marked expired. Unpaid request/hold cancellations are self-service; confirmed cancellations require reviewed operator handling.
- Commission accrues on completed eligible bookings and is a receivable, not evidence of collection. External verified refund records create immutable credit adjustments. Positive/negative settlement balances represent collections/returns still to reconcile; automated splits, payouts and refunds remain disabled.
- Vehicle intervals are whole dates [start,end), not hourly rentals. Operators must record walk-ins/external charters as blackouts. Hotel owners must maintain their existing nightly allotments; no PMS synchronization is claimed.
- Public discovery is bounded to 40 suppliers/100 vehicle records per search. Dashboards show bounded recent records and date-filtered exports are paged at 500 rows. Before much larger fleets/tenants, add dedicated public pagination, report jobs and retention capacity planning. Owner vehicle/blackout safety caps are 1000 combined, drivers 100 per business; this is not an unlimited Free-plan offer.
- Review guest-data retention/pseudonymization and access requests under the agreed commercial/privacy policy. Do not delete immutable financial ledgers to save space. No real customer data was copied into local tests.
- Seat ticketing stays disabled pending the adapter synchronization and launch gates in `FUTURE-SEAT-RESERVATIONS.md`.

## Free-plan check performed (19 November 2026)

Official Cloudflare documentation checked via its published docs repository: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/). Current published Worker size limit is 64 MiB uncompressed for Free/Paid, with no compressed-size limit; Free CPU remains 10 ms per HTTP request and requests 100,000/day. D1 Free has 50 queries per invocation, 500 MB/database and 5 GB/account; a D1 batch counts as one query against the per-invocation limit.

Local Wrangler dry-run: **17,172.01 KiB uncompressed / 4,408.78 KiB gzip**; no upload, deployment or paid resource creation. Bundle size is below the published size cap. The native 30-night hotel hold test conservatively counts each SQL batch statement as a separate operation and stays within its 40-operation service budget. Local workerd does not prove compliance with the production CPU limit. Monitor cold/warm authenticated requests on the actual Free account before customer rollout; no capacity or zero-error guarantee is made.
