-- SQL-managed public campaign module; published package facts are immutable
-- snapshots. No supplier inventory or verified payment is implied by a request.
CREATE TABLE "SalesCampaign" (
 "id" TEXT PRIMARY KEY NOT NULL,
 "agencyId" TEXT NOT NULL REFERENCES "Agency"("id") ON DELETE RESTRICT,
 "ownerId" TEXT NOT NULL,
 "slug" TEXT NOT NULL UNIQUE,
 "title" TEXT NOT NULL,
 "snapshot" TEXT NOT NULL,
 "taxBps" INTEGER NOT NULL CHECK ("taxBps" BETWEEN 0 AND 10000),
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0),
 "enabled" INTEGER NOT NULL DEFAULT 1 CHECK ("enabled" IN (0,1)),
 "expiresAt" TEXT NOT NULL,
 "createdAt" TEXT NOT NULL,
 FOREIGN KEY ("ownerId","agencyId") REFERENCES "User"("id","agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 UNIQUE ("id","agencyId")
);
CREATE INDEX "SalesCampaign_agency" ON "SalesCampaign"("agencyId","createdAt");
CREATE TABLE "PublicBookingRequest" (
 "id" TEXT PRIMARY KEY NOT NULL,
 "agencyId" TEXT NOT NULL,
 "campaignId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL,
 "requestId" TEXT NOT NULL UNIQUE,
 "requestHash" TEXT NOT NULL,
 "leadId" TEXT NOT NULL,
 "quoteId" TEXT NOT NULL,
 "createdAt" TEXT NOT NULL,
 FOREIGN KEY ("campaignId","agencyId") REFERENCES "SalesCampaign"("id","agencyId") ON DELETE RESTRICT,
 FOREIGN KEY ("leadId","agencyId") REFERENCES "Lead"("id","agencyId") ON DELETE RESTRICT,
 FOREIGN KEY ("quoteId","leadId","agencyId") REFERENCES "Quote"("id","leadId","agencyId") ON DELETE RESTRICT,
 UNIQUE ("leadId","agencyId")
);
CREATE INDEX "PublicBookingRequest_campaign" ON "PublicBookingRequest"("agencyId","campaignId","createdAt");
