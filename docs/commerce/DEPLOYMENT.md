# Release checklist

- [x] Additive migrations 0012–0014 rehearsed on temporary test databases and applied to local persisted D1.
- [x] Review defaults: commerce payments, live payments, native ads and existing live WhatsApp approval flags remain OFF. No provider activation is included.
- [x] Keep restore-bookmark + migration flow in `npm run cloudflare:release:worker`.
- [ ] Cloudflare Worker release at the exact new main commit: migration application, bundle upload and deployment all Success.
- [ ] Pages release at the same commit: generated assets deploy Success.
- [ ] `/api/health/live` release matches the deployed main commit; homepage, owner workspace, commerce and communications entry points work.
- [ ] Validate production authentication, ordinary-user denial, private cache headers and a reviewed fictional invoice. Never seed/reset production or use an actual customer for an unpaid provider test.
- [ ] Complete owned sender delivery and a single authorised provider Test Mode pilot before a separately reviewed activation.

GitHub CI passing or a main push is not proof that Cloudflare deployment has completed. This environment currently cannot fetch the production origin (proxy CONNECT 403) and has no Cloudflare deployment credential bound; provider deployment status must be verified separately. Do not claim live payments/marketing or fully automated SaaS launch from a local test report.
