# Dark dashboard and reporting preview

The reference-inspired theme uses charcoal surfaces, cyan actions, compact numeric cards, readable grid lines and restrained green/gold/pink data accents. `dark-theme` on the root body enables `src/app/dark-theme.css`; the previous red theme remains a separate review option. No external chart library or new paid service is added.

Overview now shows recorded monthly booking value as an area/line chart, monthly count/value sparklines where an actual time series exists, and an enquiry-stage ring with exact counts. The lead board, priorities, booking balances and report entry points remain available. Existing monthly reports still retain their established definitions. Booked value is not presented as profit or recognized revenue.

Analytics shows four primary metrics followed by the recorded trend. Other metrics, including provider verification, profit and financial definitions, remain available under **All metrics and financial definitions**. Date-bucket controls still expose exact recorded values and keyboard access. BI retains configurable metrics, saved views, date/group drilldown, CSV and line/bar selection; default summary cards now use four metrics so the trend is easier to reach.

Reusable charts use an explicit zero baseline, preserve negative values and break lines at missing values instead of inventing connecting values. Currency input is converted from minor units to INR only for plotting; CSV/raw reporting units remain unchanged. Chart-domain and missing-series tests cover these boundaries. Hover titles, labelled legends and existing exact-data tables accompany the charts. The reference's arbitrary earnings, countries and project statistics are not copied into TravelOS.

Dark controls extend across the other workspace modules, forms/dialogs, public/auth pages and hotel screens. Theme rules are screen-only and do not recolour printed customer documents. Screenshot reviews use fictional demo data, not customer records. No hotel inventory/payment capability or production migration/deployment is implied by this UI change.

Local preview only. Existing hotel foundation work is also pending release; do not push main or apply migrations as part of reviewing a colour/layout option without separate approval.

Verification: 63 server/unit tests and 23 production-browser tests passed; screenshots/overflow checks cover 26 workspace/public/auth screens. Two new chart tests explicitly verify recorded-zero vs missing data, negative ranges, single-point charts and gaps. White on the final primary action colour #0877ad has approximately 4.94:1 contrast. This is a palette check, not a claim of a complete accessibility audit.
