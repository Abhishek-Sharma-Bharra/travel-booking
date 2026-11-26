# SaaS billing sandbox — 26 November 2026

User requested a progress audit, remaining automation and completion of pending work. They confirmed no Razorpay account exists and commercial prices/tax/refund terms are not final. Base b0cf156. Previous guided agency/customer/supplier assistants are implemented; live AI, D1 ads, messaging, recurring billing and live performance remain incomplete.

## This phase

Build disabled-by-default, agency-owner-only Razorpay **test subscription** checkout and a separate test billing ledger on native D1. Validate configured provider plans against an explicit test catalogue, freeze amount/terms snapshots, reserve creation keys atomically, retain unknown results without automatic recreation, verify signed webhooks against authoritative provider subscription/payment/invoice data, deduplicate events/payments and record sandbox paid periods/refund adjustments/history. Browser success never changes access. Sandbox receipts are not tax invoices and never update Agency plan/status or real financial/booking records.

Default configuration has no keys/catalogue and cannot create provider resources. Reject live keys unconditionally in this sandbox. No Razorpay/OpenAI account purchase, real provider call, live charge, outbound message or paid infrastructure activation is authorised by this code work. Tests use a mocked provider and disposable local D1. Real Test Mode compatibility still needs the user's merchant account; live promotion requires a separate reviewed implementation/approval after business terms are final.

## Sequence

1. Add additive SQL-managed D1 sandbox tables (no reset/ORM baseline rewrite), immutable commercial snapshots and append-only verified test payment/refund records.
2. Add validated test-only configuration, fixed-host provider client, actor/tenant guards, atomic checkout/replay/reconciliation, signed webhook verification and private history/test receipt routes.
3. Add an agency-owner Test Mode section only when configured; keep current manual subscription UI/production entitlements unchanged. Load hosted checkout only after explicit user action. Show unresolved/verification states honestly.
4. Test ownership/disabled/demo isolation, concurrency/idempotency, plan/amount/currency mismatch, signatures and independently verified bindings, duplicate/late events, lost creation response, refunds and browser non-activation. Run relevant regressions/build and publish a reviewable release with sandbox flags off.

## Dependencies still pending

Merchant account and approved business terms, real provider Test Mode validation, live payment activation and statutory invoicing; supplier subscription scope; D1-native advertising transaction port/provider approvals; messaging sender/consent/delivery validation; live AI pilot/key/budget; monitored live load/backup/restore work. Do not describe these as completed because sandbox tests pass.
