# Corporate public website — 12 November 2026

The public site now follows the supplied business-software reference: white primary navigation, a separate product navigation row, navy information band, pale-blue split hero, large sans-serif typography and clear blue calls to action. TravelOS branding and real routes remain in use.

The homepage replaces the orbit/globe decoration with an actual screenshot of the existing read-only demo, clearly labeled as fictional. The 101 KB source JPEG is locally served through Next Image with responsive sizes and explicit dimensions. It was captured from the local seeded demo and contains no real agency/customer records. Public content does not load workspace data at request time just to show the preview.

Features, Pricing, Demo, Contact and the guide use the shared corporate navigation and styling. Capability sections, the enquiry-to-collection workflow and a direct demo/contact callout explain the actual product. Prices remain on request; provider permissions/setup requirements and manual billing descriptions remain unchanged.

Styles are scoped to `.landing` and the public site components. Authentication, the private workspace, financial calculations, provider controls, database and permissions are preserved. No additional client-side menu library, external font, stock-photo service, chat widget or API is added.

Verified locally:

- Next.js production build, including TypeScript checks, passed.
- All 5 production-browser SEO and workflow checks passed: public metadata/mobile routes, sitemap/indexing/authentication, demo entry, enquiry → quote → booking → receipt and tenant/role boundaries.
- Homepage checked at 320, 390, 768, 1024 and 1440 pixel widths with no horizontal overflow. Desktop homepage and mobile homepage/pricing screenshots were visually reviewed.
- Whitespace checks passed. No schema migration is required.

Local review captures are in ignored `test-results/business-home-desktop.png`, `business-home-mobile.png` and `business-pricing-mobile.png`. Publication is pending owner approval: pushing `main` may trigger Render auto-deploy. The previous Render deployment remains the rollback option. After Live, hard-refresh and check public navigation, optimized preview image, demo entry and sign-in.
