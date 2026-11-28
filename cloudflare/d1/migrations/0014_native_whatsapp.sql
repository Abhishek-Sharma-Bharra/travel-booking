CREATE TABLE NativeWhatsAppChannel (
 agencyId TEXT PRIMARY KEY REFERENCES Agency(id), phoneId TEXT NOT NULL UNIQUE, wabaId TEXT NOT NULL,
 displayPhone TEXT NOT NULL, credential TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
);
CREATE TABLE NativeWhatsAppConsent (
 id TEXT PRIMARY KEY,agencyId TEXT NOT NULL,bookingId TEXT NOT NULL,phone TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('SERVICE','MARKETING')),optedIn INTEGER NOT NULL CHECK(optedIn IN (0,1)),
 evidence TEXT NOT NULL,actorId TEXT NOT NULL REFERENCES User(id),createdAt TEXT NOT NULL,
 FOREIGN KEY(bookingId,agencyId) REFERENCES Booking(id,agencyId)
);
CREATE INDEX NativeWhatsAppConsent_scope ON NativeWhatsAppConsent(agencyId,bookingId,createdAt);
CREATE TABLE NativeWhatsAppOutbox (
 id TEXT PRIMARY KEY,agencyId TEXT NOT NULL,bookingId TEXT NOT NULL,requestId TEXT NOT NULL,payloadHash TEXT NOT NULL,
 phoneId TEXT NOT NULL,phone TEXT NOT NULL,template TEXT NOT NULL,language TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('SENDING','UNKNOWN','SENT','DELIVERED','READ','FAILED')),providerId TEXT UNIQUE,
 createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,
 FOREIGN KEY(bookingId,agencyId) REFERENCES Booking(id,agencyId),UNIQUE(agencyId,requestId)
);
CREATE INDEX NativeWhatsAppOutbox_scope ON NativeWhatsAppOutbox(agencyId,createdAt);
