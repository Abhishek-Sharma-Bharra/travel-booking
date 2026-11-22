# Agency Studio + grounded assistant tools

Review branch: `feature/agency-studio-phase3-20261122`; base: Phase 2 `39ccac1`. The user selected a light lavender/navy agency workspace. This change is local/review work; production and paid services remain unchanged.

## Agency experience

The signed-in `/workspace` and read-only `/demo` use an original light studio finish: white sidebar, lavender active states, navy/purple typography, consistent cards/forms/tables/dialogs and readable chart labels. A welcome panel sits above reporting filters, followed by real package/enquiry/quotation setup progress and working shortcuts. No invented customers, revenue, provider connections or progress are shown. Existing permissions, filters, CRM, financial reports, marketing, team, subscription and print workflows remain intact.

The welcome illustration is original CSS/Lucide artwork; no external image/font request or copied brand asset is required. The styles are scoped to the agency studio and screen media. Public pages and customer print documents retain their existing layouts.

## Assistant capabilities

`/workspace` → **AI Travel Agent** contains the new **Your records. A clearer next step.** console when `WORKSPACE_ASSISTANT_ENABLED=true`. Existing enquiry extraction, manual entry and customer campaign/hotel assistants are preserved.

| Tool | Actual behavior |
|---|---|
| Packages | Up to 10 matches from the first 50 maintained, authorised packages. Maintained selling rates are distinct from supplier inventory. |
| Selected enquiry | Current permitted customer requirements/contact; agents must still be assigned the lead. |
| Itinerary | Editable source-package draft with explicit missing daily detail; opens the versioned builder with the selected lead/package. No invented activities or availability. |
| Quotation | Exact integer-paise group preview from maintained selling rate, before manually reviewed tax/discount. Opens the existing quotation form; no quote is saved/approved/accepted automatically. |
| Follow-ups | Bounded recorded due-task list or English/Hindi copy-only template. No message is sent or task completed. |
| Booking | Existing agency-recorded booking/supplier status and recorded customer balance. No independent bank/inventory verification is implied. |
| Suppliers | Current approved marketplace listings and vehicle date-calendar checks. Hotel rooms still require the room-specific quote. Results are not inventory holds. |
| Payment readiness | Recorded balance and a handoff to the authorised booking workflow. **No payable link or charge is created** while an approved payment-provider flow is unavailable. |

Guided tools work with no paid AI. Optional live AI is a **single structured intent router**: a minimized user question selects a bounded read/draft tool. Model text does not set prices, pick private record IDs, run SQL, visit arbitrary URLs, reserve inventory or confirm payments/bookings. CRM datasets, private costs and customer records are not sent to this router. User-supplied text cannot be guaranteed fully anonymous; omit unnecessary personal information. Hindi/English response preference is enforced by the backend; source commercial facts/terms remain verbatim.

This is the authorised read/draft integration layer, not a claim that autonomous customer booking, live financial execution, advanced ML or automated subscription checkout is enabled. Existing customer campaign/hotel guides remain their separate verified workflows. Real provider compatibility, quality and billing still require a private staging validation with an approved key; tests mock the provider.

## Security, quota and privacy

- Authenticated actor, enabled/current agency membership, active trial/subscription, role and assignment checks; no client-supplied tenant ID is accepted. Additional database predicates fence user/role access on read tools; current access is rechecked after model routing.
- Private/no-store API responses, same-origin POST, bounded input/output, per-user request throttling, fixed provider endpoint and deadline, no automatic provider retries.
- New SQL-managed usage journal: unique agency/request key, request hash, actor, tool, mode/model, state, timestamps and safe failure code. It stores **no prompt, contact information or draft/result**.
- Atomic PostgreSQL/D1 quota reservation: guided 100/agency/UTC day; live up to 50/agency/day and 10/user/rolling hour within 100,000 tokens/day. Each live attempt conservatively reserves 10,000 tokens; reported usage reconciles the reservation. Missing/invalid usage remains conservatively reserved. Failures still count as attempts.
- Owner/manager usage view aggregates their agency; agent view is limited to their own calls. These counters cover this workspace assistant only, not all legacy AI/WhatsApp/campaign billing. Currency charges are unknown until reconciled against provider pricing/invoices; no dollar cost is invented.
- Reusing a received request key never repeats a model call. A changed payload with that key is rejected. If the response is lost, review usage before explicitly starting another lookup. Read/draft results are ephemeral to avoid persisting unnecessary customer data.

## Files and local use

- `src/app/agency-studio.css`, `src/components/agency-studio-welcome.tsx`: premium studio.
- `src/components/workspace-assistant-console.tsx`: tools, review handoffs and usage/privacy view.
- `src/lib/workspace-assistant/*`, `/api/assistant/workspace`: contracts, scoped tools, structured routing and usage reservation.
- D1 `0008_workspace_assistant.sql`; PostgreSQL `20261122000000_workspace_assistant/migration.sql`. Prior migrations and the frozen ORM baseline are unchanged.

Apply migrations only to the local/disposable database for review. Enable `WORKSPACE_ASSISTANT_ENABLED=true` on the local Worker; also keep `WORKSPACE_OPERATIONS_ENABLED=true` for the Phase 2 itinerary handoff. Live routing additionally requires `PAID_AI_ENABLED=true`, the separate `WORKSPACE_ASSISTANT_LIVE_APPROVED=true`, an explicit agency ID in `WORKSPACE_ASSISTANT_LIVE_AGENCY_IDS`, and server-only `AI_API_KEY`. None is enabled by this change. An existing paid-provider approval for another module does not automatically opt agencies into this new router. Never paste keys into chat or browser inputs.

See [deployment checklist](DEPLOYMENT.md) and [verification](VERIFICATION.md). Review screenshots with fictional test records are in ignored `.local/agency-studio-review/`.
