-- Additive: legacy costs/spend are NOT declared complete automatically.
ALTER TABLE "Agency" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE "Booking" ADD COLUMN "directCostsComplete" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "ReportingCoverage" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL REFERENCES "Agency"("id"),"fromDate" TEXT NOT NULL,"toDate" TEXT NOT NULL,"source" TEXT NOT NULL DEFAULT '',"timezone" TEXT NOT NULL,"kind" TEXT NOT NULL DEFAULT 'Advertising',"attestedBy" TEXT NOT NULL,"attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "ReportingCoverage_scope_key" ON "ReportingCoverage"("agencyId","fromDate","toDate","source","timezone","kind");
CREATE INDEX "Booking_agencyId_createdAt_idx" ON "Booking"("agencyId","createdAt");
CREATE INDEX "Transaction_agencyId_date_idx" ON "Transaction"("agencyId","date");
