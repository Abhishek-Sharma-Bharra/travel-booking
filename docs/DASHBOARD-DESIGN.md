# Dashboard and contextual tour — 12 November 2026

The latest reference is an internal software dashboard with a compact sidebar, a clear action header, a row of KPI cards and an anchored walkthrough. This update follows that layout while keeping the TravelOS navy/white/copper palette. It does not copy the reference's green/dark colors or product identity.

## Changes

- Compact 218px sidebar with the existing navigation and a clearer active state. The duplicate sidebar help card is hidden; Demo guide remains in navigation.
- Bordered page header with the existing primary actions and Take a Tour. The keyed tour component remains mounted through page navigation to preserve progress.
- Owner/manager overview KPI cards now precede the existing priority list. The same recorded metrics, filters, financial distinctions, reports and priority actions are retained; no values are invented.
- The tour creates a modal portal with four dimmed surrounding panels and a clear highlight around the actual screen header. On desktop its card sits near the highlighted element; on small screens it docks within the viewport.
- Position follows viewport resizing, scrolling and element/card size changes. Target discovery has its own animation frame so a page-height change cannot cancel finding a newly rendered target.
- Existing role-specific steps, saved progress, restart, Back, Skip and Finish behavior remain. New close button records a skip; step dots show position. Keyboard focus is trapped and restored, Escape skips, and body scrolling is locked/restored during the tour. Highlighting scrolls vertically without shifting the mobile page sideways.

No schema, auth, tenant permissions, monetary calculations or provider setup is changed. These are frontend changes in the same repository/main branch and existing Render app. No production deployment was performed.

## Verification

Production build (including TypeScript) passed. All **21** production-server browser tests passed, including saved tour progress/completion, slow auto-start behavior, mobile placement, live target highlighting, sales/PDF/receipt flows, permissions, MFA, integration UI, product preview and SEO. Tour assertions additionally verify card/spotlight placement and restoration of body scrolling. Desktop and mobile clean/tour screenshots were visually reviewed; a mobile animation was allowed to settle before capture.

Review captures, ignored by Git:

- `.local/design/dashboard-clean-desktop.png`
- `.local/design/dashboard-tour-desktop.png`
- `.local/design/dashboard-tour-enquiries.png`
- `.local/design/dashboard-tour-mobile.png`
- `.local/design/dashboard-clean-mobile.png`

## Release

This is a local draft pending owner review. Main also contains the earlier unpublished premium public-site draft; review both before publishing the combined changes. Pushing main can trigger Render automatic deployment. No database migration is needed. After Live, check the overview cards, small-screen menu, first-login tour, manual restart/skip/finish and existing booking balances. The previous Render deployment remains the rollback option.
