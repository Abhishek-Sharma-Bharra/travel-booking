ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "TwoFactor" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,"secret" TEXT NOT NULL,"backupCodes" TEXT NOT NULL,"verified" BOOLEAN NOT NULL DEFAULT true,"failedVerificationCount" INTEGER NOT NULL DEFAULT 0,"lockedUntil" TIMESTAMP(3));
CREATE INDEX "TwoFactor_userId_idx" ON "TwoFactor"("userId");
CREATE INDEX "TwoFactor_secret_idx" ON "TwoFactor"("secret");
