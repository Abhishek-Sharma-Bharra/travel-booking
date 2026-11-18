# Reliability and onboarding audit · 18 November 2026

## Changes

- Catch Worker handler and Pages binding exceptions with private, non-cached 503 responses and support references. API failures remain JSON; page failures show a minimal recovery page. Never automatically repeat writes or payments.
- Handle cleanup rejection independently so a completed response is not turned into a failed background task. Stream errors are logged; an already-started stream cannot be replaced with another response.
- Enable Worker Observability in version-controlled Wrangler config. Invocation logs are disabled; application failures record error class, sanitized source frames and request ID. Next instrumentation records route templates, not URLs, headers or customer data. Check `WORKER_REQUEST_FAILED`, `WORKER_RESPONSE_STREAM_FAILED`, `NEXT_REQUEST_FAILED`, `APP_API_UPSTREAM_FAILURE` in Cloudflare logs.
- Guard application JSON endpoints against HTML error responses. Preserve OAuth/auth redirects, raw webhook bytes and challenge responses.
- Route hashed assets through the Pages gateway. If a chunk is absent during independent Pages/Worker rollout, fetch it from the backend build's assets. Serve public images directly from Pages assets. No private-page caching.
- Use Next's retry function for recoverable page errors; add root-layout error fallback.
- Unverified enabled users can create/edit private hotel drafts and room categories. Submission, operator approval, inventory management and merchant/payment operations still require verified identities. D1 approval guards owner identity in the same atomic batch. No emailVerified flags are fabricated.
- Show email delivery readiness on hotel onboarding. When configured, the resend button calls Better Auth's verification flow. Otherwise users can save a private draft and see the outstanding delivery setup clearly.
- Consistent shared light palette and local system font; introduction before agency/hotel workspace selection; locally served 89 KB operations image. Existing print layouts remain independent.

## Deployment

Existing main-branch Cloudflare build hooks deploy both projects. No new database migration or production customer-data edit is required by this patch. Worker build uses `npm run db:generate && npm run cloudflare:build`; release uses the existing `npm run cloudflare:release:worker` with backup bookmark check. Pages uses the same Cloudflare build output `cloudflare/pages-dist`.

For real verification emails on Workers, securely set `RESEND_API_KEY` and `MAIL_FROM` to an approved sender/domain in Worker Variables and Secrets. Do not put keys in Git or chat. Reload after following the verification email. Existing `BETTER_AUTH_SECRET` and same-origin auth URL must remain configured. No new payment or AI credentials are introduced; live hotel payments remain disabled.

## Limits and evidence

The historical Error 1101 cannot be diagnosed conclusively without its exception stack: Observability was disabled. These changes address verified code paths that could escape error handling and a rollout asset race; they do not establish that either caused the historical incident. Module initialization failures, platform outages, resource limits and errors after streaming starts still require runtime evidence. Correlate the support reference with Observability logs after deployment. Do not log raw database/provider errors or customer data.

Local tests are on fictional data, Chromium and Cloudflare workerd/D1. They are not proof of production load capacity. The CRM currently loads a tenant-wide snapshot; very large tenants need a separate paginated/report-query design rather than silently dropping records. No global or cross-tenant caching has been added. Real email delivery, live payment settlement and external AI remain dependent on provider setup and are not represented as live-tested.

## Verification performed

- Production OpenNext/Cloudflare build and TypeScript checks passed.
- Server suite: 116 tests passed, including D1 concurrency, tenant isolation, hotel draft/verification gates, payment retry/webhook contracts and gateway failure behavior.
- Cloudflare Chromium suite: 8 tests passed; SEO/crawler checks: 2 passed; auth-feedback checks: 4 passed. Desktop/mobile screenshots reviewed. Local runtime flags were aligned with deployed hotel flags before the final run.
- Small local smoke: 24 read requests, three concurrent per route, zero failed responses. Local image median 8 ms, health 28 ms, home 457 ms and fictional demo 593 ms. These development workerd timings include local overhead and do not predict production latency or CPU usage.
- Remote HTTP verification is blocked by this execution environment's network proxy (403); final Cloudflare build status and live error rate must be checked in the dashboard. Historical 1101 root cause remains unconfirmed until a real exception is captured.
