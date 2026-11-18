-- Additive hotel-owned inventory and provisional reservation domain.
CREATE TABLE "HotelRoomNight" (
 "hotelId" TEXT NOT NULL, "roomId" TEXT NOT NULL, day TEXT NOT NULL,
 allotment INTEGER NOT NULL CHECK(allotment>=0 AND allotment<=10000),
 "ratePaise" INTEGER NOT NULL CHECK("ratePaise">0 AND "ratePaise"<=100000000),
 "minStay" INTEGER NOT NULL DEFAULT 1 CHECK("minStay">=1 AND "minStay"<=30),
 closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY("roomId",day),
 FOREIGN KEY("roomId","hotelId") REFERENCES "HotelRoomCategory"(id,"hotelId") ON DELETE RESTRICT
);
CREATE INDEX "HotelRoomNight_hotel_day" ON "HotelRoomNight"("hotelId",day);
CREATE TABLE "HotelStayRequest" (
 id TEXT PRIMARY KEY, "hotelId" TEXT NOT NULL, "roomId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "secretHash" TEXT NOT NULL,
 "checkIn" TEXT NOT NULL,"checkOut" TEXT NOT NULL, rooms INTEGER NOT NULL CHECK(rooms BETWEEN 1 AND 10),
 adults INTEGER NOT NULL CHECK(adults BETWEEN 1 AND 100),children INTEGER NOT NULL CHECK(children BETWEEN 0 AND 100),
 customer TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',
 subtotal INTEGER NOT NULL CHECK(subtotal>0),tax INTEGER NOT NULL CHECK(tax>=0),total INTEGER NOT NULL CHECK(total=subtotal+tax),
 "termsSnapshot" TEXT NOT NULL,"consentAt" TEXT NOT NULL,"holdUntil" TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'HELD' CHECK(status IN('HELD','EXPIRED','CANCELLED','CONFIRMED','SANDBOX_COMPLETED')),
 "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_INITIATED' CHECK("paymentStatus" IN('NOT_INITIATED','PENDING','VERIFIED','REFUND_REVIEW','SANDBOX_VERIFIED')),
 attribution TEXT NOT NULL DEFAULT '{}',"createdAt" TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE("hotelId","requestId"), UNIQUE(id,"hotelId"), UNIQUE(id,"hotelId","roomId"),
 FOREIGN KEY("roomId","hotelId") REFERENCES "HotelRoomCategory"(id,"hotelId") ON DELETE RESTRICT
);
CREATE TABLE "HotelStayNight" (
 "stayId" TEXT NOT NULL,"hotelId" TEXT NOT NULL,"roomId" TEXT NOT NULL,day TEXT NOT NULL,
 rooms INTEGER NOT NULL CHECK(rooms BETWEEN 1 AND 10),"ratePaise" INTEGER NOT NULL CHECK("ratePaise">0),
 PRIMARY KEY("stayId",day),
 FOREIGN KEY("stayId","hotelId","roomId") REFERENCES "HotelStayRequest"(id,"hotelId","roomId") ON DELETE RESTRICT,
 FOREIGN KEY("roomId",day) REFERENCES "HotelRoomNight"("roomId",day) ON DELETE RESTRICT
);
CREATE INDEX "HotelStayNight_capacity" ON "HotelStayNight"("roomId",day,"stayId");
CREATE TABLE "HotelChatSession" (
 id TEXT PRIMARY KEY,"hotelId" TEXT NOT NULL REFERENCES "Hotel"(id) ON DELETE RESTRICT,
 "secretHash" TEXT NOT NULL,messages TEXT NOT NULL DEFAULT '[]',memory TEXT NOT NULL DEFAULT '{}',
 "expiresAt" TEXT NOT NULL,"createdAt" TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','HANDOFF','REDACTED')),
 UNIQUE("hotelId","secretHash")
);
CREATE INDEX "HotelChatSession_hotel_expiry" ON "HotelChatSession"("hotelId","expiresAt");
CREATE TABLE "HotelAiUsage" (
 "hotelId" TEXT NOT NULL REFERENCES "Hotel"(id) ON DELETE RESTRICT,day TEXT NOT NULL,
 calls INTEGER NOT NULL DEFAULT 0 CHECK(calls>=0),PRIMARY KEY("hotelId",day)
);

CREATE TABLE "HotelMerchant" (
 id TEXT PRIMARY KEY,"hotelId" TEXT NOT NULL UNIQUE REFERENCES "Hotel"(id),
 "keyId" TEXT NOT NULL,credentials TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('test','live')),
 revision INTEGER NOT NULL DEFAULT 0,"createdAt" TEXT NOT NULL
);
CREATE TABLE "HotelPaymentAttempt" (
 id TEXT PRIMARY KEY,"hotelId" TEXT NOT NULL,"stayId" TEXT NOT NULL UNIQUE,
 "merchantId" TEXT NOT NULL REFERENCES "HotelMerchant"(id),"merchantRevision" INTEGER NOT NULL,
 receipt TEXT NOT NULL UNIQUE,"orderId" TEXT UNIQUE,"paymentId" TEXT UNIQUE,
 amount INTEGER NOT NULL CHECK(amount>0),currency TEXT NOT NULL DEFAULT 'INR',
 status TEXT NOT NULL CHECK(status IN('CREATING','PENDING','FAILED_NO_ORDER','RECONCILIATION_REQUIRED','CAPTURED')),
 "createdAt" TEXT NOT NULL,"verifiedAt" TEXT,"lastFailure" TEXT NOT NULL DEFAULT '',
 FOREIGN KEY("stayId","hotelId") REFERENCES "HotelStayRequest"(id,"hotelId")
);
CREATE TABLE "HotelPaymentEvent" (
 "merchantId" TEXT NOT NULL REFERENCES "HotelMerchant"(id),"eventId" TEXT NOT NULL,
 "bodyHash" TEXT NOT NULL,"eventType" TEXT NOT NULL,"createdAt" TEXT NOT NULL,
 PRIMARY KEY("merchantId","eventId")
);
