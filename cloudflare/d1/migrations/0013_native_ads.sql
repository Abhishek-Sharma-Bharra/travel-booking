CREATE TABLE NativeAdAuthorization (
 id TEXT PRIMARY KEY, agencyId TEXT NOT NULL REFERENCES Agency(id), userId TEXT NOT NULL REFERENCES User(id),
 provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')), verifier TEXT NOT NULL, expiresAt TEXT NOT NULL
);
CREATE TABLE NativeAdConnection (
 id TEXT PRIMARY KEY,agencyId TEXT NOT NULL REFERENCES Agency(id),provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')),
 accountId TEXT NOT NULL DEFAULT '', accountName TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT '',timezone TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('SELECT_ACCOUNT','CONNECTED','DISCONNECTED')),
 credentials TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,expiresAt TEXT,lastSyncedAt TEXT,errorCode TEXT NOT NULL DEFAULT '',createdAt TEXT NOT NULL,
 UNIQUE(id,agencyId)
);
CREATE UNIQUE INDEX NativeAdConnection_selected ON NativeAdConnection(agencyId,provider,accountId) WHERE status='CONNECTED';
CREATE INDEX NativeAdConnection_scope ON NativeAdConnection(agencyId,status);
CREATE TABLE NativeAdSnapshot (
 connectionId TEXT NOT NULL,agencyId TEXT NOT NULL,day TEXT NOT NULL,
 facts TEXT NOT NULL CHECK(json_valid(facts) AND length(facts)<=600000),syncedAt TEXT NOT NULL,
 FOREIGN KEY(connectionId,agencyId) REFERENCES NativeAdConnection(id,agencyId),PRIMARY KEY(connectionId,day)
);
CREATE INDEX NativeAdSnapshot_scope ON NativeAdSnapshot(agencyId,day);
