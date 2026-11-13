CREATE TABLE "Hotel" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "address" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL DEFAULT '', "region" TEXT NOT NULL DEFAULT '', "countryCode" TEXT NOT NULL DEFAULT 'IN',
  "postalCode" TEXT NOT NULL DEFAULT '', "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "contactEmail" TEXT NOT NULL DEFAULT '', "contactPhone" TEXT NOT NULL DEFAULT '',
  "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "policies" TEXT NOT NULL DEFAULT '', "cancellationPolicy" TEXT NOT NULL DEFAULT '',
  "taxBps" INTEGER NOT NULL CHECK ("taxBps" BETWEEN 0 AND 10000),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PENDING','APPROVED','REJECTED','SUSPENDED')),
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision">=0), "reviewReason" TEXT NOT NULL DEFAULT '',
  "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Hotel_status_createdAt_idx" ON "Hotel"("status","createdAt");
CREATE INDEX "Hotel_city_status_idx" ON "Hotel"("city","status");
CREATE TABLE "HotelMember" (
  "hotelId" TEXT NOT NULL REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'OWNER' CHECK ("role" IN ('OWNER','MANAGER','VIEWER')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("hotelId","userId")
);
CREATE INDEX "HotelMember_userId_idx" ON "HotelMember"("userId");
CREATE TABLE "HotelRoomCategory" (
  "id" TEXT PRIMARY KEY, "hotelId" TEXT NOT NULL REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "totalRooms" INTEGER NOT NULL CHECK ("totalRooms" BETWEEN 1 AND 10000),
  "maxAdults" INTEGER NOT NULL CHECK ("maxAdults" BETWEEN 1 AND 20),
  "maxChildren" INTEGER NOT NULL CHECK ("maxChildren" BETWEEN 0 AND 20),
  "maxOccupancy" INTEGER NOT NULL CHECK ("maxOccupancy" BETWEEN 1 AND 20 AND "maxOccupancy">="maxAdults" AND "maxOccupancy">="maxChildren" AND "maxOccupancy"<="maxAdults"+"maxChildren"),
  "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "HotelRoomCategory_id_hotelId_key" ON "HotelRoomCategory"("id","hotelId");
CREATE UNIQUE INDEX "HotelRoomCategory_hotelId_name_key" ON "HotelRoomCategory"("hotelId","name");
CREATE INDEX "HotelRoomCategory_hotelId_active_idx" ON "HotelRoomCategory"("hotelId","active");
CREATE TABLE "HotelAuditEntry" (
  "id" TEXT PRIMARY KEY, "hotelId" TEXT NOT NULL REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HotelAuditEntry_hotelId_createdAt_idx" ON "HotelAuditEntry"("hotelId","createdAt");
