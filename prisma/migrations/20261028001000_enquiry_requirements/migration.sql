ALTER TABLE "Lead" ADD COLUMN "originalMessage" TEXT NOT NULL DEFAULT '', ADD COLUMN "requirementDraft" JSONB;
