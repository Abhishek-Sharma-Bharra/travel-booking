CREATE TABLE "TourProgress" (
 "userId" TEXT PRIMARY KEY, "agencyId" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "role" TEXT NOT NULL, "step" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("userId","agencyId") REFERENCES "User"("id","agencyId") ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "TourProgress_step_check" CHECK (step >= 0),
 CONSTRAINT "TourProgress_status_check" CHECK (status IN ('ACTIVE','SKIPPED','COMPLETE'))
);
