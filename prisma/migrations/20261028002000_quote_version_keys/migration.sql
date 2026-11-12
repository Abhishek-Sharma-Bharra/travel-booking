CREATE UNIQUE INDEX IF NOT EXISTS "Quote_agencyId_leadId_version_key" ON "Quote"("agencyId","leadId","version");
