# Enquiry, quotation and booking update — 12 November 2026

This update belongs to the existing `travel-booking` repository on `main`, for the existing Render application. It does not introduce another hosting platform or database.

## Behavior

- An enquiry detail shows its saved quotations and booking, with direct navigation.
- Linked navigation shows that enquiry across all dates. Returning to the filtered list restores the user's filters.
- Saving a quotation opens its quotations; accepting one opens its booking.
- Missing packages and closed enquiries have actionable messages.
- Quotations have sequential versions per enquiry, including concurrent draft creation.
- A second draft cannot create another booking for an already booked enquiry. Changed travel dates or traveller counts require a fresh quotation.
- Existing receipt entry, booking balances, tenant permissions and quotation snapshots remain in use.

## Database change

`20261112000000_sales_quote_versions` adds `Quote.version` and a unique agency/enquiry/version index. Historical quotes receive versions in creation order. Existing nonzero versions are preserved. No table or customer record is deleted.

Before deploying, take and verify a backup of the actual Render database. Review its schema and migration history, then run the repository migration through the existing deployment process. Do not point integration tests at production.

## Verification

Completed locally:

- TypeScript checks and Next.js production build passed.
- 17 server/unit/integration tests passed, including concurrent quote versions and duplicate booking prevention.
- 7 Playwright browser tests passed, including enquiry → two quotations → booking → receipt, historical date filters, tenant/role enforcement and mobile layout.
- A disposable database upgraded from the original two migrations preserved historical quotation snapshots and assigned versions correctly. Re-running the new SQL preserved existing versions.
- A separate disposable fresh database applied all three repository migrations successfully.

These results do not verify the live Render deployment or its current database schema.

## Release and rollback

Publishing `main` may trigger Render automatic deployment. Production publication is pending owner approval and a verified database backup. Keep the previous Render deployment available until live checks pass.

After release, verify sign-in, existing records, package selection, quotation versions, booking confirmation and receipt balances using a designated test agency. If release fails, restore the prior application deployment and investigate migration logs. Keep the additive column and historical records; do not drop tables or reset production. The old application does not allocate quote versions, so restrict quotation creation while running that older application until a compatible fix is deployed. Restore a database backup only through a separately approved recovery procedure.

## Quotation PDF sharing follow-up

The existing browser Print / save PDF workflow now includes quotation reference, version and status, preserves multiline agency terms, and suggests a reference/version filename. In the print window choose **Save as PDF**. The customer message can be copied and pasted into WhatsApp/email; attach the saved PDF manually. Nothing is sent automatically and there is no public quotation link. Internal supplier costs are excluded from the customer message and quotation preview. Print controls/help are excluded from the PDF. No schema changes or new dependencies are required for this follow-up.

Follow-up verification: TypeScript and production build passed. All 7 browser tests passed, including actual Chromium PDF generation, version/status display, clipboard content, print-only visibility and restoration of the original page title.
