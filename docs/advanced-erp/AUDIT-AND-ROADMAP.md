# Advanced ERP audit and roadmap — 27 November 2026

Baseline: `7137f17`. Scope: supplied Advanced AI Travel ERP brief. This is a source/local audit, not a production incident diagnosis or certification. Existing working code is reused. No competitor assets/source were imported; competitor rendering is not verified by this environment.

## Repository findings

| Area | Implemented source | Remaining / limits |
| --- | --- | --- |
| Architecture | Next 16 / React 19, private OpenNext Worker behind Pages service binding, native D1 atomic writes, legacy PostgreSQL path | Public production status unavailable from this environment. D1-specific build cannot change engine without rebuilding. |
| Authentication/isolation | Better Auth sessions, verified email/2FA, fresh tenant identity, OWNER/MANAGER/assigned AGENT scopes, SQL bindings, same-origin writes, audit trails | Full independent security review, export/deletion policies and hosted recovery rehearsal still required. |
| Public UX | Responsive original lavender design, five-slide accessible carousel, demo, FAQ, business entries, guided tour | Public light/dark preference and broader accessibility checks are incremental work. Fictional demo records labelled. |
| CRM | Leads, CSV import/export, guarded drag-and-drop pipeline (review form), assignment, source tracking, lost reasons, customer history, follow-ups, staff analytics | Automatic assignment rules, Excel workbook support, branches, communication delivery and advanced segmentation not fully implemented. No fake buttons added. |
| Packages | Maintained packages, versioned day-wise itinerary/costing, backend quote totals, quote snapshots, printable branded documents | Native drag/drop day reordering, seasonal/adult-child price rules, approval policy, multi-currency accounting and signed customer acceptance remain. Printing to PDF is not a separately stored statutory invoice. |
| Supplier/finance | Scoped supplier balances, expenses, customer collections/refunds, contribution/BI reports, ledger exports | Structured contracts/directory/purchase orders/credit limits, GST invoice/credit-note compliance and closed-period accounting remain. No stored-value wallet. |
| Hotel/transport | Draft/review onboarding, rooms/rates/holds, reservations/check-in/out, bus/car charters, vehicle/driver availability, expenses, scoped guided assistants | Housekeeping, vehicle documents/reminders, richer PMS reports, external inventory sync, live seat ticketing and channel managers remain. |
| SaaS billing | Trial and legacy limits, manual requests/admin review, disabled test-only Razorpay subscription sandbox with signatures/idempotency/refund observations | User has no merchant account; real Test Mode compatibility unverified. No live subscriptions/renewals, entitlement activation or tax invoices. New public proposals cannot change legacy prices/limits. |
| AI/voice/ML | Guided multi-turn tools; optional budgeted model routing with approval gates; synthetic ML labels, insufficient-data baseline | Real conversational-provider pilot, voice/telephony, validated ML, lead action approval journal and consolidated cost monitoring remain. No unlimited or free voice promises. |
| Marketing/portal | Campaign snapshots/UTM attribution, guest enquiries and guarded booking paths | D1-native OAuth/ads integration, approved messaging delivery, full customer login portal/custom domains remain. Credentials alone do not finish code work. |
| Operations | CI, local D1/browser tests, 3,072 KiB project gzip guard, release restore-point/migration script | Actual production load/capacity, hosted backups/restores, live provider failures and observability review remain. |

## Phase 1 milestones

1. Audit and versioned premium *proposals*: ₹2,999 / ₹5,999 / ₹9,999 / Enterprise from ₹19,999; annual quotes; present implemented capabilities separately from upcoming/provider-dependent capabilities. Preserve existing contracts, seats and plan IDs; no checkout activation or auto-upgrade.
2. CRM review centre: exact-contact duplicate candidates, individual (nonmerged) customer segments, overdue follow-ups, lost reasons and recorded staff/source conversion. Derive only from already-authorised records; avoid ML/causal claims. Export scoped reports and deep-link to existing enquiry workflows. No contact/entity auto-merging.
3. Public appearance: user-controlled light/dark appearance, persisted locally; respect default light design and printed documents. Do not recolor private workspaces unintentionally.
4. Next domain increments: explicitly tested assignment policy, supplier directory/contracts, compliant finance documents and customer portal. Introduce additive schema only when their concrete commands and isolation tests are ready.

## Later phases and gates

Phase 2: bounded database-backed AI actions with explicit approvals; provider Test Mode payment proof; consented sender delivery; D1 ads port; voice adapter only with budget/consent and valid telephony access. Phase 3: consented tenant-history models with chronological holdout/baselines/insufficient-data states, hotel/transport ERP and external travel adapters. Phase 4: security, measured test-environment load, hosted restore and staging-to-production review. No paid service or live finance activation is authorised by implementation alone.

## Migration and rollback strategy

Milestones 1–3 need **no schema migration**: projections use existing scoped CRM data and display-only proposals. Do not alter SaaSTest or Agency contract records. Keep each milestone a reviewable commit. Reverting its application commit restores prior UI/projections without data cleanup. For later additive schema, record a D1 restore bookmark, test upgrade from existing records on disposable D1, deploy backward-compatible readers/writers, and preserve old columns/ledgers during rollback. Never seed/reset production. Production release must use the existing paired Pages/private Worker release flow and keep paid flags off until approved.

## Cost and access

This phase adds no provider calls, subscriptions or infrastructure. Projections are linear-time local calculations over the existing permitted workspace payload; no additional D1 reads. Workers CPU and D1 row reads still depend on actual data volume and require measurement. OpenAI model project/budget, Razorpay Test merchant, Meta/Google app approvals, sender configuration, telephony and supplier contracts remain external prerequisites; secret values must never be placed in chat or committed.
