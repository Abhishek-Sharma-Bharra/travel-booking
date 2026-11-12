# Premium Travel public website — 12 November 2026

This draft replaces the unpublished corporate-blue design after owner feedback. It stays in the existing repository on main and keeps the current Render production application available until approval.

## Visual direction

Warm ivory, deep navy and restrained gold, a simple single-row desktop header, large editorial serif headlines and generous space. The hero says "Your agency. Every journey. In control." and keeps the business-software purpose explicit. The scenic image sits beside the copy; the product preview appears lower on the page. Features, pricing, contact and the guide use the same public-site treatment.

The hero scenic visual is generated, not an authenticated photograph of a named destination. External photo downloads were unavailable in this workspace. It is illustrative, carries no supplier availability/location claim and can be replaced with an owner-supplied licensed photograph. The source remains in `/workspace/generated_images`; the application copy is `public/website/premium-landscape.png`. Next Image serves responsive optimized variants with reserved dimensions. The source PNG is about 2.7 MB in the repository; browsers request optimized sizes rather than the original PNG. A browser check requires the delivered hero variant to stay under 700 KB.

## Functional preview

The Enquiries / Quotations / Bookings tabs show actual screenshots captured from the existing local fictional read-only demo. They do not query or expose real customer records. Only the active panel mounts its image. Each tab controls an existing panel, supports click, Left/Right, Home/End and keyboard focus, with visible selection and a fictional-demo label.

No external fonts, carousel library, fake testimonials, customer counts, ratings or automatic chat widget are added. Existing feature claims, prices-on-request, manual billing and provider setup requirements remain accurate. The CSS is scoped to the public `.landing` area; private CRM permissions, transactions, data and database schema are preserved.

## Verification

- Production build with TypeScript passed.
- 6 production-browser checks passed: product tab interactions and optimized hero; public SEO/mobile pages; sitemap/no-index/auth boundaries; demo entry/exports; enquiry → quote → booking → receipt; tenant/role checks.
- Homepage visually reviewed on desktop and mobile; pricing visually reviewed on mobile. No horizontal overflow at 320, 390, 768, 1024 and 1440 pixel widths.
- Final tab accessibility refinement keeps all referenced panels present while mounting only the selected image; followed by another build and targeted product preview check.
- Whitespace checks passed. No migration, live message, payment or hosting change is required/performed.

Review captures are in ignored `.local/design/premium-home-desktop.png`, `premium-home-mobile.png` and `premium-pricing-mobile.png`. This is a local draft, not a verified live deployment. Publishing main can trigger Render auto-deploy; obtain the owner's design/release approval first. After Live, verify the hero image, tab switching, public links, sign-in and demo entry. Keep the previous Render deployment for rollback.
