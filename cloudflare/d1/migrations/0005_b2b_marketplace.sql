-- Additive SQL-managed marketplace. No change to legacy CRM or hotel rows.
CREATE TABLE MPPlan (
 id TEXT PRIMARY KEY CHECK(id IN ('AGENCY','HOTEL','BUS','CAR')),
 monthlyPaise INTEGER NOT NULL CHECK(monthlyPaise BETWEEN 0 AND 100000000),
 requestLimit INTEGER NOT NULL CHECK(requestLimit BETWEEN 1 AND 100000),
 resourceLimit INTEGER NOT NULL CHECK(resourceLimit BETWEEN 1 AND 1000),
 commissionBps INTEGER NOT NULL CHECK(commissionBps BETWEEN 0 AND 10000),
 platformBps INTEGER NOT NULL CHECK(platformBps BETWEEN 0 AND 10000),
 agencyBps INTEGER NOT NULL CHECK(agencyBps BETWEEN 0 AND 10000),
 supplierBps INTEGER NOT NULL CHECK(supplierBps BETWEEN 0 AND 10000),
 basis TEXT NOT NULL CHECK(basis IN ('NET_TOTAL','NET_AFTER_DISCOUNT')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 CHECK(platformBps+agencyBps+supplierBps=10000)
);
INSERT INTO MPPlan VALUES ('AGENCY',99900,1000,3,0,10000,0,0,'NET_TOTAL',0),('HOTEL',149900,1000,100,300,10000,0,0,'NET_TOTAL',0),('BUS',99900,500,20,200,10000,0,0,'NET_TOTAL',0),('CAR',79900,500,20,300,10000,0,0,'NET_TOTAL',0);
CREATE TABLE MPBusiness (
 id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES "User"(id),
 kind TEXT NOT NULL REFERENCES MPPlan(id), name TEXT NOT NULL, city TEXT NOT NULL,
 address TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
 registration TEXT NOT NULL, paymentInstructions TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','REJECTED','SUSPENDED')),
 reviewReason TEXT NOT NULL DEFAULT '',
 hotelId TEXT UNIQUE REFERENCES "Hotel"(id), agencyId TEXT UNIQUE REFERENCES "Agency"(id),
 createdAt TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(id,kind), CHECK((kind='HOTEL' AND hotelId IS NOT NULL) OR (kind<>'HOTEL' AND hotelId IS NULL)),
 CHECK((kind='AGENCY' AND agencyId IS NOT NULL) OR (kind<>'AGENCY' AND agencyId IS NULL))
);
CREATE INDEX MPBusiness_owner ON MPBusiness(ownerId,createdAt);
CREATE INDEX MPBusiness_search ON MPBusiness(status,kind,city,id);
CREATE TABLE MPSubscription (
 id TEXT PRIMARY KEY REFERENCES MPBusiness(id), status TEXT NOT NULL CHECK(status IN ('TRIAL','ACTIVE','PAUSED','CANCELLED')),
 monthlyPaise INTEGER NOT NULL CHECK(monthlyPaise>=0), expiresAt TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX MPSubscription_expiry ON MPSubscription(status,expiresAt);
CREATE TABLE MPAgreement (
 id TEXT PRIMARY KEY REFERENCES MPBusiness(id), version INTEGER NOT NULL CHECK(version>=0), terms TEXT NOT NULL,
 commissionBps INTEGER NOT NULL CHECK(commissionBps BETWEEN 0 AND 10000),
 platformBps INTEGER NOT NULL CHECK(platformBps BETWEEN 0 AND 10000),agencyBps INTEGER NOT NULL CHECK(agencyBps BETWEEN 0 AND 10000),supplierBps INTEGER NOT NULL CHECK(supplierBps BETWEEN 0 AND 10000),
 basis TEXT NOT NULL CHECK(basis IN ('NET_TOTAL','NET_AFTER_DISCOUNT')),
 acceptedAt TEXT, acceptedBy TEXT REFERENCES "User"(id), revision INTEGER NOT NULL DEFAULT 0,
 CHECK(platformBps+agencyBps+supplierBps=10000),CHECK((acceptedAt IS NULL)=(acceptedBy IS NULL))
);
CREATE TABLE MPVehicle (
 id TEXT PRIMARY KEY, businessId TEXT NOT NULL REFERENCES MPBusiness(id), name TEXT NOT NULL, registration TEXT NOT NULL,
 capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100), pricing TEXT NOT NULL CHECK(pricing IN ('TRIP','KM')),
 ratePaise INTEGER NOT NULL CHECK(ratePaise BETWEEN 1 AND 100000000), minKm INTEGER NOT NULL CHECK(minKm BETWEEN 1 AND 10000),
 taxBps INTEGER NOT NULL CHECK(taxBps BETWEEN 0 AND 10000), policies TEXT NOT NULL, photos TEXT NOT NULL DEFAULT '[]' CHECK(json_type(photos)='array'),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(businessId,registration),UNIQUE(id,businessId)
);
CREATE INDEX MPVehicle_business ON MPVehicle(businessId,active);
CREATE TABLE MPDriver (
 id TEXT PRIMARY KEY,businessId TEXT NOT NULL REFERENCES MPBusiness(id), name TEXT NOT NULL,phone TEXT NOT NULL,licenseReference TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(id,businessId)
);
CREATE TABLE MPBlackout (
 id TEXT PRIMARY KEY,businessId TEXT NOT NULL,vehicleId TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL,reason TEXT NOT NULL,
 CHECK(start<end),FOREIGN KEY(vehicleId,businessId) REFERENCES MPVehicle(id,businessId)
);
CREATE INDEX MPBlackout_dates ON MPBlackout(vehicleId,start,end);
CREATE TABLE MPBooking (
 id TEXT PRIMARY KEY,businessId TEXT NOT NULL REFERENCES MPBusiness(id),requesterId TEXT NOT NULL REFERENCES "User"(id),agencyId TEXT REFERENCES "Agency"(id),
 requestKey TEXT NOT NULL,payloadHash TEXT NOT NULL,origin TEXT NOT NULL CHECK(origin IN ('DIRECT','AGENCY_REFERRAL','MARKETPLACE','EXTERNAL_API')),
 vehicleId TEXT,hotelStayId TEXT UNIQUE REFERENCES "HotelStayRequest"(id),driverId TEXT,
 start TEXT NOT NULL,end TEXT NOT NULL,route TEXT NOT NULL,capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100),km INTEGER NOT NULL CHECK(km BETWEEN 1 AND 10000),
 customer TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,consentAt TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','HELD','CONFIRMED','COMPLETED','EXPIRED','CANCELLED','REFUNDED')),
 paymentStatus TEXT NOT NULL DEFAULT 'UNPAID' CHECK(paymentStatus IN ('UNPAID','PROVIDER_VERIFIED','EXTERNALLY_VERIFIED','REFUNDED')),
 subtotal INTEGER NOT NULL CHECK(subtotal BETWEEN 1 AND 10000000000),discount INTEGER NOT NULL CHECK(discount>=0 AND discount<=subtotal),tax INTEGER NOT NULL CHECK(tax>=0),total INTEGER NOT NULL CHECK(total=subtotal-discount+tax),
 refundedNet INTEGER NOT NULL DEFAULT 0 CHECK(refundedNet>=0 AND refundedNet<=subtotal-discount),refundedTax INTEGER NOT NULL DEFAULT 0 CHECK(refundedTax>=0 AND refundedTax<=tax),expense INTEGER NOT NULL DEFAULT 0 CHECK(expense>=0),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),holdUntil TEXT,createdAt TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
 CHECK(start<end),UNIQUE(requesterId,requestKey),UNIQUE(id,businessId),
 FOREIGN KEY(vehicleId,businessId) REFERENCES MPVehicle(id,businessId),FOREIGN KEY(driverId,businessId) REFERENCES MPDriver(id,businessId)
);
CREATE INDEX MPBooking_capacity ON MPBooking(vehicleId,status,start,end,holdUntil);
CREATE INDEX MPBooking_driver ON MPBooking(driverId,status,start,end,holdUntil);
CREATE INDEX MPBooking_supplier ON MPBooking(businessId,createdAt,id);
CREATE INDEX MPBooking_requester ON MPBooking(requesterId,createdAt,id);
CREATE INDEX MPBooking_agency ON MPBooking(agencyId,createdAt,id);
CREATE TABLE MPCommission (
 id TEXT PRIMARY KEY,bookingId TEXT NOT NULL REFERENCES MPBooking(id),eventKey TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('EARNED','REFUND_ADJUSTMENT')),
 eligibleNet INTEGER NOT NULL,commission INTEGER NOT NULL,platform INTEGER NOT NULL,agency INTEGER NOT NULL,supplier INTEGER NOT NULL,
 createdAt TEXT NOT NULL,CHECK(commission=platform+agency+supplier),CHECK((kind='EARNED' AND commission>=0) OR (kind='REFUND_ADJUSTMENT' AND commission<=0))
);
CREATE INDEX MPCommission_booking ON MPCommission(bookingId,createdAt);
CREATE TRIGGER MPCommission_immutable_update BEFORE UPDATE ON MPCommission BEGIN SELECT RAISE(ABORT,'Commission ledger is immutable'); END;
CREATE TRIGGER MPCommission_immutable_delete BEFORE DELETE ON MPCommission BEGIN SELECT RAISE(ABORT,'Commission ledger is immutable'); END;
CREATE TABLE MPSettlement (
 id TEXT PRIMARY KEY,bookingId TEXT NOT NULL REFERENCES MPBooking(id),eventKey TEXT NOT NULL UNIQUE,
 party TEXT NOT NULL CHECK(party IN ('PLATFORM','AGENCY')),direction TEXT NOT NULL CHECK(direction IN ('COLLECTED','RETURNED')),
 amount INTEGER NOT NULL CHECK(amount>0),reference TEXT NOT NULL,verifiedBy TEXT NOT NULL REFERENCES "User"(id),createdAt TEXT NOT NULL
);
CREATE INDEX MPSettlement_booking ON MPSettlement(bookingId,party);
CREATE TRIGGER MPSettlement_immutable_update BEFORE UPDATE ON MPSettlement BEGIN SELECT RAISE(ABORT,'Settlement ledger is immutable'); END;
CREATE TRIGGER MPSettlement_immutable_delete BEFORE DELETE ON MPSettlement BEGIN SELECT RAISE(ABORT,'Settlement ledger is immutable'); END;
CREATE TABLE MPAudit (
 id TEXT PRIMARY KEY,businessId TEXT REFERENCES MPBusiness(id),actorId TEXT NOT NULL REFERENCES "User"(id),action TEXT NOT NULL,details TEXT NOT NULL CHECK(json_valid(details)),createdAt TEXT NOT NULL
);
CREATE INDEX MPAudit_business ON MPAudit(businessId,createdAt);
CREATE TABLE MPUsage (businessId TEXT NOT NULL REFERENCES MPBusiness(id),day TEXT NOT NULL,operations INTEGER NOT NULL DEFAULT 0 CHECK(operations>=0),requests INTEGER NOT NULL DEFAULT 0 CHECK(requests>=0),PRIMARY KEY(businessId,day));
CREATE TABLE MPAdjustment (id TEXT PRIMARY KEY,bookingId TEXT NOT NULL REFERENCES MPBooking(id),eventKey TEXT NOT NULL UNIQUE,payloadHash TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('EXTERNAL_PAYMENT','REFUND_RECORD','CANCELLATION')),reference TEXT NOT NULL,actorId TEXT NOT NULL REFERENCES "User"(id),createdAt TEXT NOT NULL);
CREATE INDEX MPAdjustment_booking ON MPAdjustment(bookingId,createdAt);
CREATE TRIGGER MPAdjustment_immutable_update BEFORE UPDATE ON MPAdjustment BEGIN SELECT RAISE(ABORT,'Adjustment journal is immutable'); END;
CREATE TRIGGER MPAdjustment_immutable_delete BEFORE DELETE ON MPAdjustment BEGIN SELECT RAISE(ABORT,'Adjustment journal is immutable'); END;
