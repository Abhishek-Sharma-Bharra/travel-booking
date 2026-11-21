# Phase 1 review and deployment checklist

Status: development branch only. No production push, deployment, data migration, paid service activation or billing change is part of this delivery.

## Implemented scope

- Original responsive navy/lavender homepage with five product slides, six-second rotation, manual controls, hover/focus/offscreen/hidden pause, mobile horizontal swipe and reduced-motion support.
- Original, labeled fictional dashboard previews and scroll-linked feature story. Manual feature selection wins over an in-flight observer update until the user scrolls again.
- Product overview, agency/hotel/bus/car workspaces and solutions, guided-AI boundaries, intelligence/roadmap labels, how-it-works, proposed plans, read-only demo CTA, keyboard-operable native FAQs and contact/footer.
- Homepage and `/pricing` share display-only proposed agency offers (₹499/₹999/₹1,999). Hotel/transport plans require separate configuration. Proposed checkout/annual terms/entitlements are not active. Existing contracts and commission ledgers are unchanged.
- Homepage design tokens are scoped to `.saas-home`; no auth, private workspace, payment or database implementation was rewritten.

## Local review

Use the built local Pages → Worker → D1 environment; do not run fixture-writing tests against production.

```sh
npm run typecheck
npm test
npm run cloudflare:build
```

Run Worker and Pages locally using the existing development bindings, then:

```sh
npx playwright test --config playwright.cloudflare.config.ts
```

See `playwright.cloudflare.config.ts` and `docs/CLOUDFLARE-STAGING.md` for local-only setup. For a simpler visual-only preview, `HOTELS_ENABLED=true HOTEL_BOOKING_ENABLED=true npm run dev` renders the public homepage without reading a business database. It does not test the production Worker.

## Security and release gates

- [x] No new external dependency, remote font, paid AI call or third-party tracking added.
- [x] No real customer records used in product illustrations; all figures explicitly fictional.
- [x] Native links preserve agency, hotel, bus and car entry paths; bus/car workspaces remain separate entry choices.
- [x] Marketing offers do not activate access or alter negotiated billing/commission snapshots.
- [x] Hero and public pricing avoid API calls; no secrets or private dataset included in client components.
- [x] Reduced-motion, manual interaction, mobile menu/Escape, focus, horizontal-vs-vertical gestures and viewport overflow have dedicated browser checks.
- [ ] Reproduce and fix the existing production route-loading HTTP 500. This UI change does not fix or prove recovery from it.
- [ ] Obtain live-origin access and inspect the actual backend exception, not just a request summary or stack tail.
- [ ] Confirm new subscription entitlements, AI credits, annual terms and applicable taxes before activating checkout or replacing agreements.
- [ ] Complete Phase 6 versioned subscription-only transition before enabling no-commission commercial offers; preserve legacy contracts.
- [ ] Full WCAG audit, real-device testing, production performance/CPU measurement and hosted restore rehearsal remain separate gates; automated checks do not establish those results.
- [ ] Obtain explicit user production approval for the reviewed commit and migration/rollback procedure.

## Approved deployment procedure (future action only)

1. Review the concrete commit/diff and screenshots. Resolve the runtime incident first.
2. Verify a D1 restore point/backup and current bindings/secrets without exposing them. Phase 1 itself requires **no SQL migration or new environment variables**.
3. With explicit approval, merge/push the reviewed branch to the configured production branch. Existing Pages/Worker main integrations can auto-deploy; do not push main as a preview shortcut.
4. Verify both active Pages and API Worker release checks. The unrelated stale `Workers Builds: travel-booking` integration is not the active API Worker.
5. Read-only production smoke checks: public homepage/pricing, mobile navigation, agency/hotel/operator sign-in, API health and exact previously failing bus-search request using valid current/future dates. Do not create paid bookings as a smoke test.
6. If a regression appears, redeploy the previous paired Pages/Worker release and recheck bindings. Phase 1 has no data migration to reverse. Preserve request references and inspect backend logs; never retry financial writes automatically.

## Subsequent work

The audit document contains Phase 2–7 plans and additive schema/API proposals. Automated SaaS billing, live autonomous AI, real-world forecasting, R2 uploads and expanded workspace operations are **not implemented by this homepage phase**.
