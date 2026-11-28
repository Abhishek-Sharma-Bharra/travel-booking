# Remaining launch gates — current after native commerce upgrade

See [customer commerce and native connections](../commerce/README.md) for implementation details and the setup/deployment checklist. Provider accounts are not ready; live activation remains OFF. This is not a claim that all automation is finished.

| Module | Working implementation | Remaining work / external dependency |
| --- | --- | --- |
| Email | Verification/reset, admin setup and customer invitation flows | Owned verified sender, server-only provider secret and real delivery tests before enforcing verification |
| AI | Scoped guided tools, reviewed drafts and bounded optional provider routing | API project/key, agency budget and an approved live pilot |
| Platform subscriptions | Disabled Razorpay Test Mode sandbox, signed callbacks/idempotency | Merchant account, final terms/catalogue and live recurring renewal/entitlement reconciliation |
| Customer booking payments | Native D1 merchant-scoped orders, backend capture/refund verification, idempotent receipt records and review/reconciliation paths | Agency-owned merchant KYC/Test Mode and separately approved live pilot; no automatic payment split or refund initiation |
| GST | Immutable tax invoices, credit notes, financial-year numbering, explicit reviewed treatment and browser PDF | Accountant-approved business-specific rules; government IRN/e-invoice submission and GST filing are not implemented |
| Customer portal | One-use email invitations, private booking/documents/payment view, scoped HTTP-only sessions and revocation | Verified sender delivery; general customer password accounts and pre-booking online quotation acceptance remain separate |
| WhatsApp | Native D1 authorised number connection, encrypted credentials, reviewed approved text templates, purpose-specific consent and signed delivery reconciliation | Approved Meta/WABA connection and live pilot; media/button templates, bulk campaigns and unattended scheduling are not implemented in this flow |
| Ads | Native D1 Meta/Google OAuth, account selection and bounded complete read-only spend snapshots | Approved apps/developer access, encrypted configuration and real provider pilot; background sync/large-account scale are separate |
| Voice | Opt-in browser dictation in agency and supplier assistants; unsupported browsers keep typing | Inbound telephony, speech-call orchestration, call billing/consent and human handoff require further implementation/provider choice |

Do not toggle paid flags merely to remove a warning. Provider setup and unfinished implementation are separate tasks. Payment/inventory truth stays in backend records; unattended messages and financial changes need their corresponding contracts, consent and verified integration.
