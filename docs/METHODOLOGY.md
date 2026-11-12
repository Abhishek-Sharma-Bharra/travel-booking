# Financial and reporting methodology

Every persisted financial amount is an integer number of paise, with an individual stored amount limit of ₹2 crore. Decimal input parsing rejects negative values, scientific notation and more than two decimal places. Quote tax uses integer basis points and BigInt intermediate multiplication, rounding half up to the nearest paise. Counts and all aggregate sums remain within JavaScript safe integer limits for MVP datasets. Optional tax is included in commercial booked value; this is not a tax ledger.

| Metric | Definition |
|---|---|
| Enquiries | Enquiry date inside the inclusive date filter, then destination/source/salesperson/search filters |
| Active bookings | Non-cancelled bookings created in the date filter, with matching lead dimensions |
| Enquiry conversion | Selected enquiry cohort with a current non-cancelled booking ÷ cohort enquiries; bookings can occur later |
| Booked sales value | Current totals of bookings created in the range, including optional tax; cancelled bookings contribute their retained cancellation fee only |
| Net cash collected | Receipt entries minus Refund entries dated in the range, including matching bookings created outside the range |
| Customer balance | max(0, current booked obligation − receipts + refunds), across bookings created in the range |
| Refund due | max(0, receipts − refunds − current obligation), shown for cancelled bookings |
| Actual supplier cost | Expense entries minus Supplier credit entries, whether settled or not |
| Supplier balance | Expenses − credits − supplier payments + supplier refunds, separately per booking and exact supplier name |
| Booking contribution | Current booked value − actual supplier costs; excludes all advertising and operating expenses; not net profit |
| Overdue customer balance | Current positive balance where the booking due date is before today |
| Overdue follow-ups | Open enquiries matching dimensions with scheduled follow-up before today; all enquiry dates, explicitly indicated in UI |
| Follow-ups completed | Recorded activity events beginning “Follow-up completed” within the reporting month; not unique leads and not a completion percentage |
| Advertising spend | Manual monthly totals by channel; entire calendar months touched by the date range, without proration |
| Operating expenses | Agency-wide monthly recorded operating totals, separate from supplier cost and marketing spend |
| Cost per lead | Channel ad spend ÷ enquiries in the enquiry cohort; unavailable without spend or enquiries |
| Cost per acquired booking | Channel ad spend ÷ current active bookings arising from the selected enquiry cohort |
| Booked-value ROAS | Active booked value attributed to a source ÷ its channel ad spend |

## Attribution

The explicit method is **first touch**: 100% of a booking's commercial value is assigned to the source currently stored on the originating enquiry. It is not multi-touch attribution, a causal estimate, cash ROAS or recognised-revenue ROAS. It uses selected enquiry cohorts and their current booking state. Editing a source changes attribution. ROAS is absent when spend is zero, and CPL/CAC/ROAS are unavailable for destination or salesperson slices because ad spend is not allocated at those dimensions. Operating spend remains agency-wide and is labelled that way. Unattributed sources show no ROAS rather than inventing an ad cost.

## Cancellations, credits and refunds

Cancellation does not automatically move cash. Set a retained cancellation fee, then explicitly record refunds and supplier credits. A cancelled booking has booked value equal to that fee, not its original quotation. Expenses create costs, supplier payments settle liabilities, and credits reverse costs. Payments are never deducted a second time as cost. Customer refunds cannot exceed unrefunded receipts. Receipts cannot exceed current customer obligation; after cancellation that obligation is only the retained fee. Supplier payments cannot exceed the named supplier's positive balance. Credits cannot exceed its uncredited expenses, including paid expenses. A supplier refund cannot exceed the supplier's negative balance (amount owed back to the agency). Supplier refunds settle cash already owed back after a credit; they do not reverse costs a second time. Negative supplier balances explicitly represent refunds owed to the agency.

Entries are append-only in the UI. Correction/deletion and full accounting period closure are intentionally absent. Dates are calendar days stored at UTC midnight and displayed in Indian format; this avoids timezone drift in travel dates. Today-based due-date and follow-up checks use the Asia/Kolkata calendar date.

## Reports and comparisons

Reports show current stages, cancellation status and balances of the selected booking/enquiry cohort. They do **not** reconstruct historical month-end state; a later cancellation or refund can change a past cohort's displayed balances. Cash uses transaction dates. Source/destination/person filters are retained for the report; search is cleared. Prior-month comparison is shown only when prior-month enquiry data exists. Recommendations use transparent rules: review overdue follow-ups, collect positive customer balances and inspect the source with most enquiries before reallocating spend. No outcome is attributed to this software.
