-- Metadata-only assistant quota reservation. No messages or tool results are persisted.
CREATE TABLE WorkspaceAssistantUsage (
 id TEXT PRIMARY KEY,agencyId TEXT NOT NULL REFERENCES "Agency"(id),actorId TEXT NOT NULL REFERENCES "User"(id),
 requestId TEXT NOT NULL,payloadHash TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('GUIDED','LIVE')),
 state TEXT NOT NULL CHECK(state IN('RESERVED','SUCCEEDED','FAILED')),tool TEXT NOT NULL,model TEXT NOT NULL,
 reservedTokens INTEGER NOT NULL CHECK(reservedTokens BETWEEN 0 AND 10000),inputTokens INTEGER,outputTokens INTEGER,
 createdAt TEXT NOT NULL,finishedAt TEXT,failureCode TEXT NOT NULL DEFAULT '',
 UNIQUE(agencyId,requestId),CHECK(inputTokens IS NULL OR inputTokens BETWEEN 0 AND 10000),CHECK(outputTokens IS NULL OR outputTokens BETWEEN 0 AND 10000)
);
CREATE INDEX WorkspaceAssistantUsage_day ON WorkspaceAssistantUsage(agencyId,createdAt,mode);
CREATE INDEX WorkspaceAssistantUsage_actor ON WorkspaceAssistantUsage(actorId,createdAt,mode);
