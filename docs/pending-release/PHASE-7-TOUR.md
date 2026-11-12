# Phase 7 — guided walkthrough

The top bar contains Take a Tour. Authenticated users see the walkthrough on their first workspace visit; unfinished steps resume. Next, Back, Skip and Finish persist per user, tour version and actual server role. Restart is always available. Public demo starts only manually and never saves progress.

Steps navigate real Overview, Enquiries, Packages, Quotations, Bookings and Analytics screens. Owner/manager steps include authorized integrations, messaging and automation. Owner also sees Settings; agent steps omit administrative screens and explicitly explain assigned-record visibility. The walkthrough does not submit forms or mutate business records. Step headings are highlighted; a responsive dialog supports keyboard focus trapping and Escape-to-skip. A failed progress save displays an error without claiming success; a failed initial load leaves the CRM usable.

`tests/tour.test.ts` checks user/tenant binding, server role changes, invalid completion, persistence and disabled accounts. `tests/browser/tour.spec.ts` exercises first signup, real screen navigation, Back/Skip/restart/Finish, mobile and demo no-write behavior. Existing browser workflows explicitly dismiss onboarding through a shared fixture so it does not obscure their subject.
