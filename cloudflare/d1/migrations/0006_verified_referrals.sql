-- Verified bilateral referral contracts; client channel choices cannot bypass marketplace fees.
CREATE TABLE MPReferral (
 id TEXT PRIMARY KEY,businessId TEXT NOT NULL REFERENCES MPBusiness(id),agencyId TEXT NOT NULL REFERENCES "Agency"(id),
 status TEXT NOT NULL CHECK(status IN('ACTIVE','REVOKED')),reference TEXT NOT NULL,verifiedBy TEXT NOT NULL REFERENCES "User"(id),createdAt TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(businessId,agencyId)
);
CREATE INDEX MPReferral_agency ON MPReferral(agencyId,status);
