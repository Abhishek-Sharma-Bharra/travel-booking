CREATE TABLE "AutomationPolicy" (
 "agencyId" TEXT PRIMARY KEY REFERENCES "Agency"("id"), "enabled" BOOLEAN NOT NULL DEFAULT false,
 "ads" BOOLEAN NOT NULL DEFAULT false, "reminders" BOOLEAN NOT NULL DEFAULT false, "notifications" BOOLEAN NOT NULL DEFAULT false,
 "summaries" BOOLEAN NOT NULL DEFAULT false, "alerts" BOOLEAN NOT NULL DEFAULT false, "revision" INTEGER NOT NULL DEFAULT 0,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AutomationJob" (
 "id" TEXT PRIMARY KEY, "agencyId" TEXT NOT NULL REFERENCES "Agency"("id"), "kind" TEXT NOT NULL, "key" TEXT NOT NULL,
 "payload" JSONB NOT NULL, "policyRevision" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "attempts" INTEGER NOT NULL DEFAULT 0, "failures" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT NOT NULL DEFAULT '', "leaseUntil" TIMESTAMP(3), "errorCode" TEXT NOT NULL DEFAULT '', "result" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AutomationJob_agencyId_key_key" ON "AutomationJob"("agencyId","key");
CREATE UNIQUE INDEX "AutomationJob_id_agencyId_key" ON "AutomationJob"("id","agencyId");
CREATE INDEX "AutomationJob_status_availableAt_leaseUntil_idx" ON "AutomationJob"("status","availableAt","leaseUntil");
CREATE TABLE "AutomationAttempt" (
 "id" TEXT PRIMARY KEY, "agencyId" TEXT NOT NULL, "jobId" TEXT NOT NULL, "attempt" INTEGER NOT NULL,
 "status" TEXT NOT NULL, "errorCode" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("jobId","agencyId") REFERENCES "AutomationJob"("id","agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "AutomationAttempt_agencyId_createdAt_idx" ON "AutomationAttempt"("agencyId","createdAt");
