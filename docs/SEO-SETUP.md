# Public website and SEO — Render

This update stays in the existing repository and Render application. It does not change the database, subscriptions, authentication flow or provider settings.

## Public pages

| URL                          | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `/`                          | Travel agency CRM overview and demo entry                                |
| `/features`                  | Existing features and integration setup requirements                     |
| `/pricing`                   | Current team/stored enquiry limits, price on request, manual billing     |
| `/product-demo`              | Searchable explanation of the fictional demo                             |
| `/contact`                   | Owner-authorized public email `avinav.vashisht@gmail.com` and demo entry |
| `/guides/enquiry-to-booking` | Practical enquiry, quote, booking and payment-record workflow            |
| `/privacy`, `/terms`         | Existing policy summaries with distinct metadata                         |

Each public page has a unique title and description, canonical URL, Open Graph and Twitter text metadata. Copy is rendered on the server without requiring browser JavaScript. The homepage includes Organization and SoftwareApplication JSON-LD with no invented ratings, reviews, price offers or sales statistics. This is descriptive markup, not a promise of rich-result eligibility.

`/sitemap.xml` lists only these eight public pages. Dates are omitted instead of inventing last-modified dates. Authentication, internal demo, workspace, admin and API routes are excluded. The internal demo is accessible to visitors but intentionally not indexed; `/product-demo` is the searchable introduction.

The root metadata defaults to no-index; public pages explicitly opt in. Private/internal routes also send `X-Robots-Tag: noindex, nofollow, noarchive`. `robots.txt` lists crawler exclusions. Authentication and role checks remain the access control; crawler instructions do not secure records or remove already indexed URLs immediately.

## Render configuration

Defaults match the current production Render URL and owner-confirmed contact email; no new secrets or API keys are needed for the base update.

- `PUBLIC_SITE_URL=https://vashisht-travelos.onrender.com` — primary bare HTTPS origin. Credentials, paths, query strings and fragments are rejected. Do not derive canonical URLs from browser-submitted host headers.
- `SITE_INDEXING_ENABLED=true` — defaults true for the public production site. Set false on private staging/preview copies; this returns an empty sitemap, disallows crawlers and sends no-index headers. Rebuild/redeploy after changes.
- `PUBLIC_CONTACT_EMAIL=avinav.vashisht@gmail.com` — public business contact, separate from SMTP login/sender credentials and API keys.
- `GOOGLE_SITE_VERIFICATION` — optional public HTML verification token from Search Console. Set it in Render and rebuild. Do not paste an entire HTML tag, OAuth token, password or private API key.

When a custom domain is ready, first configure DNS/HTTPS on Render. Update canonical origin and the separately configured authentication origin, verify sign-in/callbacks, and redirect old public URLs to the primary domain. Do not silently switch hosting, DNS or authentication settings as part of this update.

## Google Search Console — owner steps after deployment

1. Sign in at `https://search.google.com/search-console/` using the Google account that should own the property.
2. Add a **URL prefix** property for `https://vashisht-travelos.onrender.com/`. You do not control the `onrender.com` parent domain; do not attempt a domain-property DNS verification for it.
3. Choose the HTML tag method, copy only the `content` verification value and privately set `GOOGLE_SITE_VERIFICATION` in Render. Rebuild/redeploy, then click Verify in Search Console. Keep the token configured while ownership depends on it.
4. Submit `https://vashisht-travelos.onrender.com/sitemap.xml` in Sitemaps.
5. Use URL Inspection on the homepage and features page, inspect the live result and request indexing where available. Monitor indexed/excluded pages over time. Do not request indexing of login, workspace, API, reset or invitation URLs.
6. Once a custom domain is connected, create/verify the corresponding property and submit its updated sitemap. Keep one primary origin to avoid duplicate-site signals.

No Google property was created or verified in this workspace. Search indexing and ranking are controlled by search engines and are not guaranteed. Render Free cold starts remain possible and can affect both visitors and crawlers; this update does not purchase a hosting plan.

## Release and validation

Review the public contact email and content. Publication can trigger Render automatic deployment when `main` is pushed; obtain the owner's release approval before pushing. No database migration is required for this update. Keep the prior application release available for rollback.

Checks: production build; SEO origin/staging test; production-server browser checks for server-rendered titles, canonical/social metadata, sitemap allowlist, no-index headers, retained authentication, honest pricing/contact and mobile layout. Verified locally on 12 November 2026: production build and TypeScript passed; the SEO origin/staging unit test passed; all 18 existing CRM browser regressions passed against the production build. Both new SEO browser checks passed after correcting the test to recognize Next.js streamed login redirects. Metadata, sitemap and no-index/auth boundaries were checked; mobile contact layout was visually inspected. Whitespace checks passed. No provider messages, live charges, Google account actions or production deployment were performed.
