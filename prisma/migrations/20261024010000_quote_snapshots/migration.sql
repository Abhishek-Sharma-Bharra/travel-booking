ALTER TABLE "Quote"
 ADD COLUMN "travelStart" TIMESTAMP(3),
 ADD COLUMN "travelEnd" TIMESTAMP(3),
 ADD COLUMN "packageName" TEXT,
 ADD COLUMN "destination" TEXT,
 ADD COLUMN "duration" INTEGER,
 ADD COLUMN "inclusions" TEXT,
 ADD COLUMN "exclusions" TEXT;
UPDATE "Quote" q SET "travelStart"=l."travelStart", "travelEnd"=l."travelEnd", "packageName"=p."name", "destination"=p."destination", "duration"=p."days", "inclusions"=p."inclusions", "exclusions"=p."exclusions"
FROM "Lead" l, "Package" p WHERE q."leadId"=l.id AND q."packageId"=p.id;
ALTER TABLE "Quote"
 ALTER COLUMN "travelStart" SET NOT NULL,
 ALTER COLUMN "travelEnd" SET NOT NULL,
 ALTER COLUMN "packageName" SET NOT NULL,
 ALTER COLUMN "destination" SET NOT NULL,
 ALTER COLUMN "duration" SET NOT NULL,
 ALTER COLUMN "inclusions" SET NOT NULL,
 ALTER COLUMN "exclusions" SET NOT NULL;
