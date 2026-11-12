# Business intelligence reports

Open **BI Reports** beside Analytics in the existing workspace. This adds a report builder to the existing Render application and PostgreSQL reporting API. No database migration, external BI subscription or new hosting is required.

## Build and explore

- Select up to eight summary metrics and choose breakdown columns.
- Filter dates, destination, source, agent and package; reporting windows cover 1–366 calendar days in the agency's reporting timezone.
- Compare the selected period with the preceding equal calendar-day period. Rate changes use percentage points; other changes use absolute amounts. An unavailable baseline stays unavailable.
- Choose line/bar trends by day, week or month. Expand the exact trend table and select a bucket to filter its dates, clipped to the selected range.
- Group by source, destination, agent or package; click a group to filter the report.
- Export metrics, trends or the **currently loaded group table page** (20 rows per page) as CSV. Exports include dates, timezone, reporting timestamp and explicit units. Monetary machine values use integer INR paise; rates use fractions. Formula-like cell contents are escaped.

## Personal views

Save up to 12 named configurations per user and agency in this browser. Views contain fixed dates, filters and display preferences only, not report results or customer records. They do not synchronize across devices, belong to team shared reports, or form part of database backups. Clearing browser storage removes them. Public demo saving is disabled. Corrupt/unsupported saved settings are ignored.

## Data meaning and permissions

The builder uses the existing [KPI definitions](phase-1/README.md) and authenticated analytics endpoint. Each metric exposes its definition and any missing-data reason. Booking value, manual receipts, provider-verified collections, refunds, contribution and profit remain distinct. Missing verified collections, recognized revenue and net profit show **Data unavailable**; no estimates are invented.

Lead conversion uses the enquiry cohort; booking counts/value use booking creation dates; receipts/refunds use recorded ledger dates. Package enquiry counts can overlap, so package rows are not additive lead totals. Recorded costs are not necessarily complete. Current outstanding balances are snapshots rather than historical recognized revenue. A zero trend means no recorded event, not provider verification. Today can be partial.

Every refresh/export request reuses server-side tenant and role enforcement. Agents see assigned enquiries and cannot access another agent's scope. Financial cost/margin controls are omitted for agents; modified saved preferences cannot bypass server authorization. No provider credentials or live payments/messages are involved.

## Verification

Unit/integration tests cover saved-setting validation, date clipping, missing-value comparisons and CSV financial restrictions/formula escaping. Browser tests cover chart/filter interaction, CSV downloads, mobile overflow, personal persistence and cross-agency/agent authorization. Existing sales, authentication and workspace regression tests remain applicable. Local tests use fictional records; no production records are modified.

## Release and rollback

Review and approve the same-repository main update before pushing to Render. Keep existing environment variables and database unchanged. If needed, roll back to the preceding Render deployment; this feature introduces no schema changes. Saved browser preferences can remain harmlessly stored after rollback.
