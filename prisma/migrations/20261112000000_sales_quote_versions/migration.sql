-- Preserve existing version values if a previous deployment already added them.
-- On the original schema, assign deterministic versions to historical quotations.
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
WITH ranked AS (
 SELECT id, ROW_NUMBER() OVER (PARTITION BY "agencyId","leadId" ORDER BY "createdAt",id)::integer AS version
 FROM "Quote"
)
UPDATE "Quote" AS q SET "version"=ranked.version FROM ranked WHERE q.id=ranked.id AND q."version"=0;
ALTER TABLE "Quote" ALTER COLUMN "version" SET DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_agencyId_leadId_version_key" ON "Quote"("agencyId","leadId","version");
