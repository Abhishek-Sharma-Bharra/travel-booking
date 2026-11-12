-- Revisions prevent stale browser attestations. Triggers cover direct SQL as well as application writes.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "costRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Agency" ADD COLUMN IF NOT EXISTS "adSpendRevision" INTEGER NOT NULL DEFAULT 0;
CREATE FUNCTION public.invalidate_booking_cost_coverage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  IF OLD.kind IN ('Expense','Supplier credit') THEN UPDATE public."Booking" SET "directCostsComplete"=false,"costRevision"="costRevision"+1 WHERE id=OLD."bookingId" AND "agencyId"=OLD."agencyId"; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  IF NEW.kind IN ('Expense','Supplier credit') THEN UPDATE public."Booking" SET "directCostsComplete"=false,"costRevision"="costRevision"+1 WHERE id=NEW."bookingId" AND "agencyId"=NEW."agencyId"; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER invalidate_booking_cost_coverage AFTER INSERT OR UPDATE OR DELETE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION public.invalidate_booking_cost_coverage();
CREATE FUNCTION public.invalidate_advertising_coverage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  IF OLD.kind='Advertising' THEN UPDATE public."Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE id=OLD."agencyId"; DELETE FROM public."ReportingCoverage" WHERE "agencyId"=OLD."agencyId" AND kind='Advertising'; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  IF NEW.kind='Advertising' THEN UPDATE public."Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE id=NEW."agencyId"; DELETE FROM public."ReportingCoverage" WHERE "agencyId"=NEW."agencyId" AND kind='Advertising'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER invalidate_advertising_coverage AFTER INSERT OR UPDATE OR DELETE ON "Spend" FOR EACH ROW EXECUTE FUNCTION public.invalidate_advertising_coverage();
