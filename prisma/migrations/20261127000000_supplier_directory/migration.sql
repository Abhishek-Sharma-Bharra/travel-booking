-- Additive private agency directory. Does not replace or rewrite supplier ledgers.
CREATE TABLE "AgencySupplier" (
 id TEXT PRIMARY KEY, "agencyId" TEXT NOT NULL REFERENCES "Agency"(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100), kind TEXT NOT NULL CHECK(kind IN('HOTEL','TRANSPORT','DMC','SIGHTSEEING','GUIDE','OTHER')),
 city TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('ACTIVE','ARCHIVED')),
 payload TEXT NOT NULL CHECK(payload::jsonb IS NOT NULL AND length(payload)<=12000), revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 29),
 "createdAt" TEXT NOT NULL,"updatedAt" TEXT NOT NULL,UNIQUE(id,"agencyId")
);
CREATE INDEX AgencySupplier_scope ON "AgencySupplier"("agencyId","updatedAt",id);
CREATE TABLE "AgencySupplierVersion" (
 id TEXT PRIMARY KEY,"supplierId" TEXT NOT NULL,"agencyId" TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 29),payload TEXT NOT NULL CHECK(payload::jsonb IS NOT NULL AND length(payload)<=12000),
 "requestId" TEXT NOT NULL,"payloadHash" TEXT NOT NULL,"actorId" TEXT NOT NULL REFERENCES "User"(id),"createdAt" TEXT NOT NULL,
 FOREIGN KEY("supplierId","agencyId") REFERENCES "AgencySupplier"(id,"agencyId"),UNIQUE("supplierId",revision),UNIQUE("agencyId","requestId")
);
CREATE INDEX AgencySupplierVersion_scope ON "AgencySupplierVersion"("agencyId","supplierId",revision);
CREATE FUNCTION deny_supplier_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Supplier history is immutable'; END;
$$;
CREATE TRIGGER AgencySupplierVersion_no_change BEFORE UPDATE OR DELETE ON "AgencySupplierVersion" FOR EACH ROW EXECUTE FUNCTION deny_supplier_version_change();
