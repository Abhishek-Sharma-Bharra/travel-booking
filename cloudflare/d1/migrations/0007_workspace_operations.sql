-- Additive Phase 2 workflows. Existing applied migrations and contracts are unchanged.
CREATE TABLE WorkspaceItinerary (
 id TEXT PRIMARY KEY, agencyId TEXT NOT NULL REFERENCES "Agency"(id),
 leadId TEXT NOT NULL, packageId TEXT, title TEXT NOT NULL,
 startDate TEXT NOT NULL, daysCount INTEGER NOT NULL CHECK(daysCount BETWEEN 1 AND 60),
 payload TEXT NOT NULL CHECK(json_valid(payload)), revision INTEGER NOT NULL CHECK(revision>=0),
 createdBy TEXT NOT NULL REFERENCES "User"(id), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 UNIQUE(id,agencyId), FOREIGN KEY(leadId,agencyId) REFERENCES "Lead"(id,agencyId),
 FOREIGN KEY(packageId,agencyId) REFERENCES "Package"(id,agencyId)
);
CREATE INDEX WorkspaceItinerary_scope ON WorkspaceItinerary(agencyId,leadId,updatedAt);
CREATE TABLE WorkspaceItineraryVersion (
 id TEXT PRIMARY KEY, itineraryId TEXT NOT NULL, agencyId TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=0), payload TEXT NOT NULL CHECK(json_valid(payload)),
 requestId TEXT NOT NULL, payloadHash TEXT NOT NULL, actorId TEXT NOT NULL REFERENCES "User"(id), createdAt TEXT NOT NULL,
 FOREIGN KEY(itineraryId,agencyId) REFERENCES WorkspaceItinerary(id,agencyId),
 UNIQUE(itineraryId,revision), UNIQUE(agencyId,requestId)
);
CREATE TRIGGER WorkspaceItineraryVersion_no_update BEFORE UPDATE ON WorkspaceItineraryVersion BEGIN SELECT RAISE(ABORT,'Itinerary history is immutable'); END;
CREATE TRIGGER WorkspaceItineraryVersion_no_delete BEFORE DELETE ON WorkspaceItineraryVersion BEGIN SELECT RAISE(ABORT,'Itinerary history is immutable'); END;
CREATE TABLE HotelGuestStay (
 stayId TEXT PRIMARY KEY, hotelId TEXT NOT NULL, checkedInAt TEXT NOT NULL, checkedOutAt TEXT,
 checkedInBy TEXT NOT NULL REFERENCES "User"(id), checkedOutBy TEXT REFERENCES "User"(id),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 FOREIGN KEY(stayId,hotelId) REFERENCES HotelStayRequest(id,hotelId)
);
CREATE INDEX HotelGuestStay_scope ON HotelGuestStay(hotelId,checkedInAt);
CREATE TABLE HotelGuestStayEvent (
 id TEXT PRIMARY KEY, hotelId TEXT NOT NULL REFERENCES "Hotel"(id), stayId TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN('CHECK_IN','CHECK_OUT')), actorId TEXT NOT NULL REFERENCES "User"(id),
 requestId TEXT NOT NULL, payloadHash TEXT NOT NULL, createdAt TEXT NOT NULL,
 FOREIGN KEY(stayId,hotelId) REFERENCES HotelStayRequest(id,hotelId), UNIQUE(hotelId,requestId)
);
CREATE TRIGGER HotelGuestStayEvent_no_update BEFORE UPDATE ON HotelGuestStayEvent BEGIN SELECT RAISE(ABORT,'Guest stay history is immutable'); END;
CREATE TRIGGER HotelGuestStayEvent_no_delete BEFORE DELETE ON HotelGuestStayEvent BEGIN SELECT RAISE(ABORT,'Guest stay history is immutable'); END;
CREATE UNIQUE INDEX WorkspaceItineraryVersion_scope ON WorkspaceItineraryVersion(id,agencyId);
CREATE TABLE WorkspaceItineraryQuote (
 versionId TEXT PRIMARY KEY,agencyId TEXT NOT NULL,leadId TEXT NOT NULL,quoteId TEXT NOT NULL UNIQUE,createdAt TEXT NOT NULL,
 FOREIGN KEY(versionId,agencyId) REFERENCES WorkspaceItineraryVersion(id,agencyId),
 FOREIGN KEY(quoteId,leadId,agencyId) REFERENCES "Quote"(id,leadId,agencyId)
);
