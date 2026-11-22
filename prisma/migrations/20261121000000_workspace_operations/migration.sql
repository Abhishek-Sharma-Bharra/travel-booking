-- SQL-managed additive workflow tables; do not modify the applied baseline schema.
CREATE TABLE "WorkspaceItinerary" (
 "id" TEXT PRIMARY KEY, "agencyId" TEXT NOT NULL REFERENCES "Agency"(id),
 "leadId" TEXT NOT NULL, "packageId" TEXT, "title" TEXT NOT NULL,
 "startDate" TEXT NOT NULL, "daysCount" INTEGER NOT NULL CHECK("daysCount" BETWEEN 1 AND 60),
 "payload" TEXT NOT NULL CHECK(jsonb_typeof("payload"::jsonb)='object'), "revision" INTEGER NOT NULL CHECK("revision">=0),
 "createdBy" TEXT NOT NULL REFERENCES "User"(id), "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL,
 UNIQUE(id,"agencyId"), FOREIGN KEY("leadId","agencyId") REFERENCES "Lead"(id,"agencyId"),
 FOREIGN KEY("packageId","agencyId") REFERENCES "Package"(id,"agencyId")
);
CREATE INDEX "WorkspaceItinerary_scope" ON "WorkspaceItinerary"("agencyId","leadId","updatedAt");
CREATE TABLE "WorkspaceItineraryVersion" (
 id TEXT PRIMARY KEY,"itineraryId" TEXT NOT NULL,"agencyId" TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=0),payload TEXT NOT NULL CHECK(jsonb_typeof(payload::jsonb)='object'),
 "requestId" TEXT NOT NULL,"payloadHash" TEXT NOT NULL,"actorId" TEXT NOT NULL REFERENCES "User"(id),"createdAt" TEXT NOT NULL,
 FOREIGN KEY("itineraryId","agencyId") REFERENCES "WorkspaceItinerary"(id,"agencyId"),
 UNIQUE("itineraryId",revision), UNIQUE("agencyId","requestId")
);
CREATE FUNCTION reject_itinerary_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Itinerary history is immutable'; END;
$$;
CREATE TRIGGER "WorkspaceItineraryVersion_no_mutation" BEFORE UPDATE OR DELETE ON "WorkspaceItineraryVersion" FOR EACH ROW EXECUTE FUNCTION reject_itinerary_version_mutation();
CREATE UNIQUE INDEX "WorkspaceItineraryVersion_scope" ON "WorkspaceItineraryVersion"(id,"agencyId");
CREATE TABLE "WorkspaceItineraryQuote" (
 "versionId" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"leadId" TEXT NOT NULL,"quoteId" TEXT NOT NULL UNIQUE,"createdAt" TEXT NOT NULL,
 FOREIGN KEY("versionId","agencyId") REFERENCES "WorkspaceItineraryVersion"(id,"agencyId"),
 FOREIGN KEY("quoteId","leadId","agencyId") REFERENCES "Quote"(id,"leadId","agencyId")
);
