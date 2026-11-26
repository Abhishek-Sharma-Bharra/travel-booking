# Agency subscription billing sandbox

26 November 2026. The user confirmed **no Razorpay account exists and prices/tax/refund terms are not final**. This is test-only implementation, not a commercial checkout launch.

## Implemented

- Owner-only native D1 test subscription creation against an explicit server catalogue and independently checked Razorpay test plan. Snapshot freezes amount, currency, period, cycles and terms; stale quotes are rejected.
- Atomic creation reservation, tenant/request uniqueness, one open checkout per agency and retained UNKNOWN states. Lost responses are never automatically converted into another provider subscription. An original provider ID can be reconciled only after server-side merchant/plan/checkout-note verification.
- Separate signed webhook endpoint. Raw bytes/signature are checked before processing. Subscription/payment/invoice/refund references are independently fetched from the fixed provider API. Amount/currency/paid invoice/period must match. Browser callbacks do not verify money.
- Immutable test receipts, recurring paid-period records, append-only refund adjustments and event/body/payment replay protection. Overlapping periods fail for review rather than double-crediting. Cancellation is sticky; later notifications do not reopen a closed subscription. Failed/halted states do not erase previously verified periods.
- Sandbox owner UI only when fully configured and explicitly allowlisted. Hosted SDK loads only on user action. Live-key, quote mismatch and non-test responses are refused. History/test receipt downloads are private and owner-scoped.
- No Agency plan/status/expiry update, booking ledger mutation, provider refund/cancellation command, real-money charge or tax invoice is performed. Existing manual billing and existing customer contracts remain unchanged. A provider's own Test Mode subscription handles simulated recurring charges; this app records verified test events only.

## Local/controlled Test Mode configuration

Do not enable these on the public deployment just to make a button appear. Defaults are off/empty.

| Name | Purpose |
|---|---|
| `SAAS_BILLING_TEST_ENABLED` | Explicit test-only gate; default `false` |
| `SAAS_TEST_RAZORPAY_KEY_ID` | Separate platform test merchant key, must start `rzp_test_` |
| `SAAS_TEST_RAZORPAY_KEY_SECRET` | Server Secret; never public/frontend |
| `SAAS_TEST_RAZORPAY_WEBHOOK_SECRET` | Separate random 32+ character server Secret |
| `SAAS_BILLING_TEST_AGENCY_IDS` | One to ten explicit pilot agency IDs; no implicit opt-in of customers |
| `SAAS_BILLING_TEST_CATALOG_JSON` | Reviewed test catalogue; empty disables checkout |

Catalogue items require: `code`, `label`, `appPlan` (Starter/Growth/Professional), `providerPlanId`, integer `amountPaise`, `currency` INR, `period` monthly/yearly, `totalCycles`, `termsVersion`, `taxLabel`, `cancellationTerms`. The provider plan must have interval 1 and the same period/amount/currency. No ₹499/₹999/₹1,999 rates are silently installed as commercial offers.

After the user's merchant Test Mode account is available, create a **fictional** provider plan, confirm subscriptions access, configure secrets privately on an isolated pilot, and validate with the provider's current Test Mode tools. This repository's provider tests are mocked; actual merchant payload compatibility and subscriptions eligibility are **not yet verified**. A successful ChatGPT subscription does not provide OpenAI API billing, and a hotel's payment account must not be reused as the SaaS platform merchant.

Test webhook: `/api/billing/sandbox/webhook`. Configure it **only for the matching Test Mode merchant**, with the matching signature secret. Supported events: `subscription.charged`, activated/pending/halted/paused/resumed/cancelled/completed, and `refund.processed`. Requests must contain JSON, `x-razorpay-signature` and `x-razorpay-event-id`. Unsupported/untracked events are acknowledged without granting access.

An untracked refund arriving before its payment may not produce a per-refund row; later payment verification retains the provider's aggregate `amount_refunded` and marks the test receipt for review. Replay the matching verified refund after the receipt exists when a full reference-level test adjustment trail is required. Do not claim a complete live reconciliation system from this sandbox.

## User review

Agency owner → Subscription. Normal customers continue seeing manual billing; the sandbox section is hidden when off/not allowlisted. In an isolated configured pilot: review the fictional plan, accept the test terms, open hosted test checkout and inspect verified test history after webhook delivery. A browser success message only says verification is pending. Test receipt JSON is explicitly not a tax invoice or a real-money receipt. UI lists up to 20 recent checkouts and 40 recent receipts; a receipt download caps individual adjustment rows at 100 and labels truncation.

Unknown creation: find the **original** subscription in the merchant Test Mode dashboard using its `travelos_checkout` note, then reconcile that ID. Do not guess success by creating another subscription. If no provider reference exists, keep the record unresolved until an authorised operator checks the merchant; no automatic discard/recreate path is provided. Changing test merchant keys requires operator reconciliation. Before disabling/removing a pilot, reconcile/cancel its provider test resources; this code does not send provider cancellation/refund commands.

## Migration / release / rollback

D1 migration `0009_saas_billing_sandbox.sql` adds four sandbox tables, indexes and immutable-ledger/snapshot constraints. Additive migration `0010_saas_refund_observation.sql` records independently verified cumulative refund observations on new adjustment rows, without rewriting existing ledger entries. No reset, test seed import, Prisma baseline rewrite or PostgreSQL entitlement migration. Other runtimes keep manual billing and report sandbox unavailable. Use the existing release script's D1 restore-point check and migration step before deploying paired Pages/private Worker code. Keep the test flag false and leave keys/catalogue/allowlist empty in the current public release.

Rollback by disabling the sandbox flag and returning code to the prior reviewed release; retain ledger/checkouts for reconciliation. Do not delete UNKNOWN records or immutable test history to bypass safeguards. A Git push/CI pass is not a verified Cloudflare deployment or an active payment integration.

## Still pending for commercial billing and full automation

- Final prices, taxes, terms, merchant eligibility/account, real Test Mode validation and error/reconciliation drills.
- A separately reviewed live implementation/approval: production entitlements, migration of existing contracts, upgrades/proration, self-service mandate cancellation, statutory invoices, tax/accounting/recovery/renewal notices and real refunds. Live keys are intentionally rejected by this sandbox.
- Hotel/bus/car subscription billing scope remains separate from the agency-only sandbox.
- Live AI key/budget/pilot; native D1 ads transaction port and provider app approvals; messaging sender/consent/template/delivery validation; monitored production load/backup/restore checks.

## Cloudflare build budget

The native D1 Cloudflare build includes only the generated D1 runtime client and uses Wrangler minification: measured gzip **2,943.21 KiB**, down from 4,511.10 KiB. A local dry-run build guard enforces this project’s 3,072 KiB budget before release. This is a project guard, not a live account-limit query. Regular PostgreSQL builds retain their client configuration; changing a compiled Cloudflare database engine requires rebuilding. No paid infrastructure was activated.
