-- Existing application ledger entry forms accept date-only values and save UTC midnight.
-- Preserve those nominal calendar dates; do not shift their historical dates on timezone changes.
ALTER TABLE "Transaction" ADD COLUMN "dateBasis" TEXT NOT NULL DEFAULT 'CALENDAR';
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_dateBasis_valid" CHECK ("dateBasis" IN ('CALENDAR','INSTANT'));
