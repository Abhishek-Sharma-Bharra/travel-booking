# Centered CRM public website — 12 November 2026

This draft follows the latest supplied CRM reference: a white header, cream hero background, centered black sans-serif headline and description, red calls to action and a large pale-blue product preview frame. TravelOS branding, truthful content and real product routes stay in place. The previous unpublished corporate, scenic-premium and dashboard-tour redesigns are superseded.

## What changes

- Public header: Features, Pricing, Demo, Resources, Contact, sign-in and agency signup. Mobile retains both sign-in and a compact Sign up action.
- Centered headline: "Keep your enquiries moving. Keep your business connected."
- Actual demo screenshots in keyboard-accessible Enquiries / Quotations / Bookings tabs. Only the selected image mounts; all ARIA-controlled panels exist. Screenshot records are fictional, labeled accordingly and do not query live customer data.
- Straightforward benefit, workflow and contact sections. Public Features, Pricing, Contact and guide pages share the typography and colors.
- No scenic imagery, new fonts, extra animation library, fake testimonial or unimplemented AI/anomaly feature claim. The previously generated scenic visual is removed from the application tree.

The private workspace, guided tour and associated tour test are restored exactly to the existing `e60befc` version. The rejected dashboard changes will not be published as part of the final tree. The speed optimizations and existing CRM behavior remain in that base. No database/schema, financial, provider or authorization changes are required.

## Validation

Production build with TypeScript passed. Production browser checks cover preview keyboard/click behavior and optimized image delivery, public SEO/mobile pages, sitemap/no-index/auth boundaries, original guided tour and enquiry → quote → booking → receipt flow. All **8** targeted production-browser tests passed (23.0 seconds).

Desktop homepage, first screen, mobile homepage and mobile pricing were visually reviewed. Homepage checked at 320, 390, 768, 820, 1024 and 1440 pixel widths with no horizontal overflow. Existing canonical metadata, Search Console support, contact email and prices-on-request are preserved.

Review captures are ignored by Git:

- `.local/design/crm-reference-first-screen.png`
- `.local/design/crm-reference-desktop.png`
- `.local/design/crm-reference-mobile.png`
- `.local/design/crm-reference-pricing-mobile.png`

This is a local draft in the existing repository/main. Nothing was deployed or connected to a new hosting service. Publishing main requires owner approval and can trigger Render auto-deploy. After Live, check the homepage, public links, signup/sign-in, product tabs and the original dashboard. No migration is needed; the previous Render release remains the rollback option.
