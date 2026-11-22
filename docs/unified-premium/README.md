# Unified premium screens — 22 November 2026

User reference: the existing dark-sidebar agency screenshot should visually match the supplied light public homepage; extend that appearance across the application. Base `fed0a79` already contains the local agency studio, which has not been deployed. Work remains on `feature/unified-premium-screens-20261122`; no production deployment is authorised by this styling instruction.

## Changes

- Shared screen-only design layer using homepage navy `#1b2943`, lavender surfaces, white cards, purple/blue primary buttons, consistent Segoe UI typography, rounded fields and clear focus states.
- Existing upgraded agency studio retained; its primary actions use the same homepage gradient. Existing agency pages (CRM, reports, customers, packages, itineraries, bookings, finance, AI, marketing, team/settings/subscriptions) share its layout and controls.
- Analytics date-bucket controls use a compact, readable lavender strip with a clear selected state instead of short dark labels and empty vertical space.
- Marketing subpages, hotel-business entry and marketplace: consistent logo mark/navigation, lavender page introductions, cards and footer.
- Login/signup, recovery, invitations, MFA and legal screens: shared light page/card/field/link treatment.
- Hotel owner/review/guest workspaces, bus/car operator and platform marketplace administration: light cards, lavender selected states, matching navigation/rates/forms/calendars/tables. The hotel welcome illustration/photo is retained with a light copy panel.
- Public campaign pages changed from dark green/blue to the same light palette through their scoped CSS module. Guest forms, quote/hold/consent behavior remains unchanged.
- Client subscription admin gets a scoped visual wrapper; loading and global-error fallback receive matching colors and readable actions.

## Boundaries

No backend, authentication, permission, pricing, payment, migration or production configuration changes. Customer PDFs/print CSS remain independent. The public homepage itself remains the supplied reference. Existing substantive legal/marketing copy is not changed by this visual task.

## Review and deployment

Run typecheck/Cloudflare build, existing Cloudflare browser journeys (including campaign, agency forms/print, hotel inventory/guests and operator/admin flows), SEO tests and public/private visual sweeps. Capture desktop/mobile previews in ignored `.local/unified-premium-review/`.

The live site still needs a separately approved deployment of the complete reviewed chain (Phase 2, studio/assistant and this visual update). Apply paired additive migrations/flags only under the existing deployment checklist; keep paid AI/live financial features disabled. Do not describe local styling work as already visible in production. The old production 1101 incident still needs live verification before a recovery claim.
