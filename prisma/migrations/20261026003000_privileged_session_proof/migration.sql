-- Only successful, library-validated second-factor challenges populate this proof.
ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
