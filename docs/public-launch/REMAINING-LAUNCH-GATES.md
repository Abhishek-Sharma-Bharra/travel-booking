# Remaining implementation and launch gates

This is not a claim that all requested automation is finished.

| Module | Working foundation | Remaining code / external dependency | Activation check |
| --- | --- | --- | --- |
| Email | Verification/reset and admin setup flows | Owned verified sender, server-only provider secret, delivery testing | Test delivery and one-use links before enforcing verification |
| AI | Scoped guided tools, drafts and bounded optional provider route | API project/key, agency budget and approved live pilot | No invented prices or financial confirmation; log cost and failures |
| Subscriptions | Disabled Razorpay Test Mode sandbox, signed callbacks/idempotency | Merchant account, final terms/catalogue; live renewals and entitlement reconciliation | Test replay/late/refund events before a separate live release |
| GST | Branded booking/quotation print documents | Statutory invoice/credit-note numbering, tax and place-of-supply implementation | Accountant-approved rules, immutable issued documents and refund linkage |
| Customer portal | Public package/hotel journeys and booking requests | Full authenticated customer records, signed online quotation acceptance | Tenant/contact isolation, expiring links and replay prevention |
| WhatsApp | Reviewed drafts and manual contact links; messaging foundation | Approved WABA/templates/opt-in; complete native D1 delivery integration | Per-agency isolation, signature/replay validation, uncertain-send reconciliation |
| Ads | Integration foundation and role-scoped records | Meta app/Google OAuth approvals and remaining D1 connector work | Read-only spend pilot, currency/timezone accuracy and token rotation |
| Voice | No active inbound call module | Provider/number, consent, speech pipeline, turn handling, human handoff | Bounded pilot, interruption/retry behavior and explicit spending approval |

Do not toggle paid flags merely to remove a warning. Provider setup and unfinished implementation are separate tasks. Payment/inventory truth stays in backend records; autonomous messages and financial changes need their corresponding contracts, consent and verified integration.
