# Production deployment security follow-up — 21 November 2026

The user explicitly approved Phase 1 production deployment after reviewing the local homepage delivery. Commit `703c91b` was pushed to main; both active Cloudflare Pages and API Worker deployment checks passed. Its GitHub CI build, server suite and browser suite also passed, but the final `npm audit --omit=dev` step failed.

## Finding and correction

The upstream advisory [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw) identifies regex denial-of-service in Effect's `Schema.TemplateLiteral` for versions through 3.22.0. The installed Prisma configuration dependency pinned Effect 3.20.0. Audit reported one underlying advisory propagated through six dependency entries, not six distinct application findings.

A scoped npm override selects `effect@3.22.1` under `@prisma/config`. Only the Effect package changed in the lockfile. Prisma, Better Auth and Next remain at their reviewed versions. The npm integrity hash was updated from the registry, and installation selected the overridden version successfully. The scoped override is needed while Prisma's configuration package pins the affected release; review removal only after the upstream dependency is fixed and audited.

The production dependency audit now reports zero vulnerabilities. No audit exclusion or severity-threshold relaxation was introduced. No database schema, business records, billing contracts, payment flags or environment variables changed.

This is a dependency compatibility/security follow-up, not a demonstrated fix for the separate production route-loading 500 incident. No exploited application input path was established by this audit alone.

## Validation

- Dependency installation changed one package; `npm ls effect` resolves 3.22.1 under Prisma configuration.
- Prisma client generation and the D1 schema consistency check passed.
- TypeScript and the Cloudflare production build passed.
- Server tests: 135 passed, 0 failed after the dependency update.
- Cloudflare browser compatibility suite: 17 passed after rebuilding with the patched dependency, including CRM, campaigns, hotel holds, charters and responsive homepage controls.
- Use the final deployment checks for the security follow-up commit before considering the release fully verified.

## Deployment and rollback

The security follow-up belongs to the approved Phase 1 release. Confirm both active provider checks and the CI audit on the follow-up commit. Do not treat the obsolete `Workers Builds: travel-booking` integration as the active backend.

If the UI needs reverting later, preserve this patched dependency selection in the rollback build rather than blindly reinstalling the known-affected lockfile. The recurring production runtime incident and live verification/access limits remain as documented in the incident report.
