# Workspace loading improvements — 12 November 2026

Hosting remains Render, with the existing PostgreSQL database. No schema migration, hosting-plan purchase, provider call, customer-data deletion or persistent tenant-data cache is introduced.

## Findings and changes

- Monthly/current-versus-previous report calculations ran on every workspace render, including modal/notification changes. Memoize them against data, month, relevant dimensions and the current India calendar day. The date dependency ensures a later render after midnight refreshes overdue calculations.
- Locale currency/date formatters were constructed repeatedly. Reuse immutable Intl formatters, while formatting fresh date/value inputs each time. Compute the India day once per analysis instead of once per eligible lead.
- Analytics, integrations, messaging, automation, subscription and security screens were eager client imports. Use Next dynamic imports with a visible loading status so unused screens can load on demand. Core navigation and the initial overview remain available.
- Workspace data repeated full package-master objects inside each quotation and booking's quotation, despite the UI using quotation snapshots and the separately supplied package list. Remove these unused nested package expansions. Keep all quotation snapshots, package IDs, booking transactions, permitted records, role redaction and the complete package list.
- Fetch billing enquiry counts and owner invitations concurrently with the existing independent queries, avoiding the extra sequential wait. Authorization/agency filters remain server-side. No global cache of customer data is added.

The internal `/api/data` response no longer has the unused `quotes[].package` and `bookings[].quote.package` expansions. Existing first-party callers do not consume them; integrations relying on undocumented expansions should resolve `packageId` against `packages` instead. No records, prices or snapshots are removed from the database.

## Local evidence

Measurements used the same seeded fictional demo: 1,500 enquiries and 330 bookings. They are local engineering measurements, not Render production timings or a capacity guarantee.

| Measure                                        |          Before | After initial optimization |
| ---------------------------------------------- | --------------: | -------------------------: |
| Median legacy `analyse` call, 12 samples       |       100.87 ms |                    7.08 ms |
| `/demo` uncompressed initial HTML/RSC document | 3,642,781 bytes |            3,224,601 bytes |
| `/demo` initial script bytes                   |         912,337 |                    879,965 |
| `/demo` summed gzip script bytes               |         276,976 |                    269,731 |
| Public home script bytes                       |         579,039 |                    579,039 |

The script-size change is modest; most core framework code still needs loading. The response-size reduction is about 11.5%. The larger calculation reduction applies to this analysis function, not the entire app. Locale/date work remains current rather than caching a day's string indefinitely.

Local `npm run test:load` passed with 80 requests at concurrency 8 and no unexpected HTTP statuses (the documented local p95 threshold is 5 seconds). Before/after wall-clock load results can be affected by other build/browser processes on the same host, so no production latency percentage is inferred from them.

## Verification and limitations

TypeScript and production build passed. The existing 53 server/unit/integration checks passed; an additional formatter regression passed across India midnight, exact fractional INR values and invalid dates. All 20 production-server browser checks passed, covering loaded-on-demand screens, the sales journey/PDF, reporting, role/tenant boundaries, MFA, tours and SEO. The final report date-dependency safeguard also passed the production build and all 3 targeted workflow browser tests.

Live Render timings could not be measured here: network access to the public Render origin returned a proxy restriction. The prior dashboard shows a Free web instance, whose idle cold starts can delay initial access by 50 seconds or more. These code changes do not remove that infrastructure behavior. The owner must distinguish initial wakeup from continued in-app slowness; check Render CPU, memory, response logs and application/database regions before changing plans.

Full workspace data is still delivered for existing reports/exports. The local demo document remains several MB. Larger datasets will need a separately designed server-paginated list/report API; silently truncating records would make exports, balances and analytics incomplete and is not done here.

Production publication remains subject to owner approval. After Render reports the new commit Live, compare a first visit after inactivity with repeated navigation while warm; verify quotation totals, monthly report dimensions and receipts before treating the incident as resolved. Keep the previous deployment available for rollback. No deployment or paid-plan change was performed by the local verification work.
