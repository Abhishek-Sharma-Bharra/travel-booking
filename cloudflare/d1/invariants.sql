-- Guard assertions are statements inside the same D1 batch as their writes.
-- CHECK failure rolls back the complete batch. Successful batches delete guards.
CREATE TABLE "_TravelOSAtomicGuard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ok" INTEGER NOT NULL CHECK ("ok"=1)
);

-- Preserve direct-cost coverage invalidation, including direct SQL mutations.
CREATE TRIGGER "booking_cost_insert" AFTER INSERT ON "Transaction"
WHEN NEW."kind" IN ('Expense','Supplier credit') BEGIN
  UPDATE "Booking" SET "directCostsComplete"=0,"costRevision"="costRevision"+1
  WHERE "id"=NEW."bookingId" AND "agencyId"=NEW."agencyId";
END;
CREATE TRIGGER "booking_cost_delete" AFTER DELETE ON "Transaction"
WHEN OLD."kind" IN ('Expense','Supplier credit') BEGIN
  UPDATE "Booking" SET "directCostsComplete"=0,"costRevision"="costRevision"+1
  WHERE "id"=OLD."bookingId" AND "agencyId"=OLD."agencyId";
END;
CREATE TRIGGER "booking_cost_update_old" AFTER UPDATE ON "Transaction"
WHEN OLD."kind" IN ('Expense','Supplier credit') BEGIN
  UPDATE "Booking" SET "directCostsComplete"=0,"costRevision"="costRevision"+1
  WHERE "id"=OLD."bookingId" AND "agencyId"=OLD."agencyId";
END;
CREATE TRIGGER "booking_cost_update_new" AFTER UPDATE ON "Transaction"
WHEN NEW."kind" IN ('Expense','Supplier credit') BEGIN
  UPDATE "Booking" SET "directCostsComplete"=0,"costRevision"="costRevision"+1
  WHERE "id"=NEW."bookingId" AND "agencyId"=NEW."agencyId";
END;

-- Delete attestations whenever advertising totals or their source rows change.
CREATE TRIGGER "advertising_insert" AFTER INSERT ON "Spend"
WHEN NEW."kind"='Advertising' BEGIN
  UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE "id"=NEW."agencyId";
  DELETE FROM "ReportingCoverage" WHERE "agencyId"=NEW."agencyId" AND "kind"='Advertising';
END;
CREATE TRIGGER "advertising_delete" AFTER DELETE ON "Spend"
WHEN OLD."kind"='Advertising' BEGIN
  UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE "id"=OLD."agencyId";
  DELETE FROM "ReportingCoverage" WHERE "agencyId"=OLD."agencyId" AND "kind"='Advertising';
END;
CREATE TRIGGER "advertising_update_old" AFTER UPDATE ON "Spend"
WHEN OLD."kind"='Advertising' BEGIN
  UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE "id"=OLD."agencyId";
  DELETE FROM "ReportingCoverage" WHERE "agencyId"=OLD."agencyId" AND "kind"='Advertising';
END;
CREATE TRIGGER "advertising_update_new" AFTER UPDATE ON "Spend"
WHEN NEW."kind"='Advertising' BEGIN
  UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE "id"=NEW."agencyId";
  DELETE FROM "ReportingCoverage" WHERE "agencyId"=NEW."agencyId" AND "kind"='Advertising';
END;
