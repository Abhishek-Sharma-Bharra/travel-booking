# Public homepage design system — Phase 1

Original direction for Vashisht TravelOS by Vashisht Analytics. Inspired by the requested level of SaaS polish, not copied layouts or assets. The external reference sites were inaccessible from the managed environment; no visual comparison is claimed.

- Surface: white with soft lavender (`#faf8ff`, `#f0ebfc`), subtle borders and restrained shadows.
- Primary ink: navy `#1b2943`; body copy `#65728a`. Small text uses darker muted hues so it does not disappear into light surfaces.
- Action gradient: purple `#7044d9` to blue `#4264d6`, with white labels. Secondary actions use explicit dark text on white. Focus rings remain visible.
- Typography: reuse the existing Segoe UI/system stack, no remote font dependency. Display headings 39–59 px; section titles 31–42 px; body copy 12–14 px. Dashboard illustrations have intentionally smaller presentation text and one descriptive image role; they do not expose fake controls.
- Layout: maximum 1328 px including 40 px desktop gutters; 21 px mobile gutters. Four workspace cards collapse to one; other grids collapse to two/one. Existing private workspaces and printed documents keep their current styles.
- Components: native-link homepage navigation, accessible mobile menu, five-slide hero, six dashboard illustration variants, scroll-linked feature story, workspace entry cards, AI conversation illustration, intelligence status cards, proposed pricing, native FAQ disclosures and contact/footer.
- Motion: six-second timed hero, pause on hover/focus/hidden/offscreen, manual arrows/dots/keyboard/swipe. Manual selection stops autoplay. Reduced-motion disables automatic rotation and CSS animation. No animation library or paid asset dependency added.
- Truthfulness: fictional previews are labeled; no testimonials, ratings or customer counts. Forecasting/advisor roadmap and optional live-AI setup are explicit. Pricing is proposed and not an active checkout. Existing subscription/commission contracts and ledger snapshots are unchanged.
- Hero and price cards render without backend calls. They are not evidence that the separate production runtime incident is resolved.

`/pricing` reuses the same display-only offer catalogue as the homepage. The old dynamic marketplace commission price cards are not used on these two marketing pages; the existing component, admin controls, records and contractual calculations remain preserved. Final subscription entitlements are not inferred from marketing cards.
