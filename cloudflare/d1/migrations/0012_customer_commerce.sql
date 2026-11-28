-- Additive, native D1 commerce records. Existing bookings and money ledgers are unchanged.
CREATE TABLE CommerceSequence (
 agencyId TEXT NOT NULL REFERENCES Agency(id), financialYear TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('INVOICE','CREDIT_NOTE')),
 value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 999999), PRIMARY KEY(agencyId,financialYear,kind)
);
CREATE TABLE CommerceDocument (
 id TEXT PRIMARY KEY, agencyId TEXT NOT NULL, bookingId TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('INVOICE','CREDIT_NOTE')), originalId TEXT,
 number TEXT NOT NULL CHECK(length(number)<=16), financialYear TEXT NOT NULL,
 requestId TEXT NOT NULL, payloadHash TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 taxable INTEGER NOT NULL CHECK(taxable BETWEEN 1 AND 2000000000),
 cgst INTEGER NOT NULL CHECK(cgst>=0), sgst INTEGER NOT NULL CHECK(sgst>=0), igst INTEGER NOT NULL CHECK(igst>=0),
 total INTEGER NOT NULL CHECK(total=taxable+cgst+sgst+igst AND total<=2000000000),
 actorId TEXT NOT NULL REFERENCES User(id), createdAt TEXT NOT NULL,
 FOREIGN KEY(bookingId,agencyId) REFERENCES Booking(id,agencyId),
 FOREIGN KEY(originalId,agencyId) REFERENCES CommerceDocument(id,agencyId),
 CHECK((kind='INVOICE' AND originalId IS NULL) OR (kind='CREDIT_NOTE' AND originalId IS NOT NULL)),
 CHECK((igst=0) OR (cgst=0 AND sgst=0)),
 UNIQUE(id,agencyId), UNIQUE(agencyId,number), UNIQUE(agencyId,requestId)
);
CREATE INDEX CommerceDocument_booking ON CommerceDocument(agencyId,bookingId,createdAt);
CREATE TRIGGER CommerceDocument_no_update BEFORE UPDATE ON CommerceDocument BEGIN SELECT RAISE(ABORT,'Issued documents are immutable'); END;
CREATE TRIGGER CommerceDocument_no_delete BEFORE DELETE ON CommerceDocument BEGIN SELECT RAISE(ABORT,'Issued documents are immutable'); END;
CREATE TABLE CustomerInvitation (
 id TEXT PRIMARY KEY, agencyId TEXT NOT NULL, bookingId TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE,
 email TEXT NOT NULL, actorId TEXT NOT NULL REFERENCES User(id), createdAt TEXT NOT NULL,
 expiresAt TEXT NOT NULL, consumedAt TEXT, revokedAt TEXT,
 FOREIGN KEY(bookingId,agencyId) REFERENCES Booking(id,agencyId)
);
CREATE INDEX CustomerInvitation_scope ON CustomerInvitation(agencyId,bookingId);
CREATE TABLE CustomerPortalSession (
 tokenHash TEXT PRIMARY KEY, invitationId TEXT NOT NULL REFERENCES CustomerInvitation(id),
 createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL
);
CREATE INDEX CustomerPortalSession_expiry ON CustomerPortalSession(expiresAt);
CREATE TABLE CommercePaymentOrder (
 id TEXT PRIMARY KEY, agencyId TEXT NOT NULL, bookingId TEXT NOT NULL,
 requestId TEXT NOT NULL, payloadHash TEXT NOT NULL,
 providerOrderId TEXT UNIQUE, providerPaymentId TEXT UNIQUE, providerKeyId TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount BETWEEN 100 AND 2000000000),
 mode TEXT NOT NULL CHECK(mode IN ('TEST','LIVE')),
 state TEXT NOT NULL CHECK(state IN ('CREATING','READY','UNKNOWN','CAPTURED','REVIEW')),
 createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 FOREIGN KEY(bookingId,agencyId) REFERENCES Booking(id,agencyId),
 UNIQUE(agencyId,requestId)
);
CREATE INDEX CommercePaymentOrder_booking ON CommercePaymentOrder(agencyId,bookingId,createdAt);
CREATE TABLE CommercePaymentRefund (
 id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES CommercePaymentOrder(id),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 2000000000),
 state TEXT NOT NULL CHECK(state IN ('RECORDED','REVIEW')), createdAt TEXT NOT NULL
);
CREATE INDEX CommercePaymentRefund_order ON CommercePaymentRefund(orderId);
