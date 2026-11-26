# Verification — 26 November 2026

## Final checks

- `npm test`: **160 passed**, including eight new sandbox integration tests on disposable native D1.
- `npx playwright test --config playwright.cloudflare.config.ts`: **22 passed** on compiled local Pages → private Worker → D1.
- Final Cloudflare/OpenNext build, TypeScript and frozen D1 ORM schema check passed. D1 migrations 0009 and 0010 applied to the local persisted test database only. No remote database/provider operation was performed by these commands.
- `git diff --check`: passed. No dependencies added.

The final compact D1-only/minified artifact also passed all **22 browser tests**. Wrangler reported **2,943.21 KiB gzip**, below the project’s 3,072 KiB guard. The guard passed at its normal budget and correctly rejected an intentional 2,048 KiB negative check. The late-refund focused suite passed eight tests after migration 0010, including authoritative cumulative refund observation across earlier and subsequent adjustments.

## Financial/security evidence

Server tests cover disabled/default-empty config, rejection of live keys, explicit pilot allowlist, fresh owner/demo/disabled/foreign access checks, provider plan/quote mismatch, atomic concurrent creation, snapshot immutability, stable request-key replay after catalogue changes, UNKNOWN creation without recreation, original-provider-ID reconciliation, signatures, independent payment/invoice/subscription bindings, event/body/payment replay, failed/cancelled and late events, append-only refunds, over-refunds, observed already-refunded payments, overlapping periods and distinct recurring paid periods. Native additive migration is applied after seeding a fictional existing paid agency; its actual plan/status/trial and paid expiry remain unchanged.

Browser tests verify default-off customer UI/API, CSRF/anonymous protection, explicit fictional test terms, rejection of an unexpected live-key response before SDK open, stable request keys on retry and an untrusted hosted-checkout success callback that does not alter the real tenant's plan/status/expiry or create a verified receipt. Provider/SDK transport is mocked, not a real merchant test. The existing agency, campaign/guest booking, hotel/transport inventory/operations/admin and responsive homepage journeys pass.

An old immediate computed-style read intermittently inspected a detached sidebar during signup rendering in the first parallel run. It now uses Playwright's retrying `toHaveCSS` assertion with the same required white color. Targeted recheck and final full 22-test run passed; no production color requirement was relaxed.

Visual review: test-only sandbox card on mobile, and existing full-suite screenshots including uppercase wordmarks. Ignored artifacts: `.local/saas-billing-review/`.

## Release status and limits

Uppercase wordmarks were separately committed/pushed as `b47f238`; GitHub checks passed. This sandbox release must keep `SAAS_BILLING_TEST_ENABLED=false`, with no keys/catalogue/allowlist provisioned. Its additive schema and off-by-default code do not change real entitlements, collect money, refund/cancel with the provider, send notifications or issue statutory tax invoices. Receipt downloads cap adjustment rows and label truncation; recent history is bounded, not a complete export/accounting system.

The user has no Razorpay account and has not finalised terms. Real Test Mode payload compatibility/merchant eligibility remains unverified. Live financial execution, production entitlement activation, live AI, D1 ads port, messaging and measured live capacity remain pending. A Git push/CI pass does not verify Cloudflare completion; live-site and Cloudflare API access are unavailable in this environment.
