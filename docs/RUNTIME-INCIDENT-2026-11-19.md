# Production runtime incident — 19 November 2026

Status: unresolved; do not treat a successful build or local browser suite as evidence of production recovery.

## Confirmed evidence

- The supplied Pages invocation for `GET /` returned HTTP 500. Its outcome was `ok`, with no exceptions or application logs. This means the Pages invocation completed; it does not establish successful application behavior.
- The reported API support reference was `9ecd93cb-8391-456d-b447-f170d17ce3d7`. The gateway emits this message when the backend fetch throws or an application JSON endpoint returns non-JSON. The message alone does not distinguish these cases.
- Pages CPU measurements exclude the separate backend invocation. Neither CPU exhaustion nor a database failure has been established.
- Release `d41bfd42d757221df5cfe784637be8a9560658d3`: active Pages, active API Worker and GitHub CI checks passed. The unused legacy `Workers Builds: travel-booking` integration failed; it is distinct from the active `vashisht-travelos-api-staging` backend.
- Direct production requests from the managed development environment were rejected by its outbound proxy (CONNECT 403). This is not the website's HTTP response.

## Local checks

56 requests across the actual Pages gateway and backend Worker: `/`, `/hotel-business`, `/hotelier`, `/login?next=hotelier`, `/api/health/live`, `/api/hotelier`, `/api/marketplace/plans`. No 5xx responses; unauthenticated hotel API returned 401. These checks used local D1 and are not a capacity benchmark or a production check.

An earlier probe incorrectly used `/api/health`, which is not a route. Its HTML 404 was converted by the JSON guard to 503. This was a probe mistake, not evidence of a failing health endpoint.

## Diagnostic changes

- Pages overwrites the incoming support reference and forwards a fresh UUID to the backend.
- The backend preserves valid UUID references in request-local storage; Next's error handler uses the same reference and retains its own digest separately.
- Pages and backend log HTTP 5xx responses even when their fetch handlers do not throw.
- Backend invocation logging is enabled so platform-level failures can be inspected.
- Diagnostic records do not include request cookies, query strings, body values or raw exception messages. HTTP statuses and response bodies remain unchanged; no write retries were introduced.

## Required production verification

1. Review/save and publish the managed Codex environment's saved network draft adding only `travel-booking-dnn.pages.dev`. Saving that draft does not apply it. Existing custom domains and package-manager presets were preserved.
2. Verify the diagnostic release succeeded for both active deployments.
3. Reproduce public requests read-only and inspect status, content type, support reference and Cloudflare error code. Do not run fixture-writing browser tests against production.
4. Correlate `PAGES_UPSTREAM_HTTP_FAILURE` / `APP_API_UPSTREAM_FAILURE` with `WORKER_HTTP_FAILURE`, `NEXT_REQUEST_FAILED`, `NEXT_ERROR_CONTEXT`, or the backend invocation outcome. Inspect backend CPU only if that invocation indicates a resource failure.
5. Fix the demonstrated cause and repeat the exact failing flow before marking recovered. No paid infrastructure or live financial transactions are authorized by this diagnostic work.

## Diagnostic release validation

- `npm run typecheck`: passed.
- `npx tsx --test tests/cloudflare.test.ts`: 14 passed, including cross-layer reference correlation and sensitive-data exclusions.
- `npm run cloudflare:build`: passed.
- `npx playwright test --config playwright.cloudflare.config.ts`: 10 passed (51.5 seconds), covering CRM, campaigns, hotel inventory/holds, owner entry, marketplace charters and onboarding.

These checks used local fictional data. The underlying production 500 remains unresolved pending access and matching backend evidence.
