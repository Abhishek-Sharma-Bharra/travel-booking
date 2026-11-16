-- Fresh D1 schema only; do not execute against PostgreSQL.
-- Application runtime port is still in progress.
-- CreateTable
CREATE TABLE "Agency" (
    "adSpendRevision" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logo" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT 'Thank you for choosing us. Prices are subject to availability.',
    "plan" TEXT NOT NULL DEFAULT 'Starter',
    "subscription" TEXT NOT NULL DEFAULT 'Trial',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" DATETIME NOT NULL DEFAULT (datetime('now', '+14 days')),
    "subscriptionExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ("adSpendRevision" BETWEEN -2147483648 AND 2147483647),
    CHECK ("demo" IN (0,1))
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "agencyId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CHECK ("role" IN ('OWNER','MANAGER','AGENT')),
    CHECK ("emailVerified" IN (0,1)),
    CHECK ("disabled" IN (0,1)),
    CHECK ("twoFactorEnabled" IN (0,1))
);

-- CreateTable
CREATE TABLE "Session" (
    "mfaVerifiedAt" DATETIME,
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lead" (
    "originalMessage" TEXT NOT NULL DEFAULT '',
    "requirementDraft" JSONB,
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "destination" TEXT NOT NULL,
    "enquiryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "travelStart" DATETIME NOT NULL,
    "travelEnd" DATETIME NOT NULL,
    "travellers" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,
    "quotedPrice" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "assignedId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'New',
    "notes" TEXT NOT NULL DEFAULT '',
    "lostReason" TEXT NOT NULL DEFAULT '',
    "followUp" DATETIME,
    "firstResponseHours" REAL,
    "repeatCustomer" BOOLEAN,
    "itineraryRequested" BOOLEAN,
    "score" REAL,
    "scoreReason" TEXT NOT NULL DEFAULT 'Not scored: required inputs missing',
    "modelVersion" TEXT,
    "scoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedId_agencyId_fkey" FOREIGN KEY ("assignedId", "agencyId") REFERENCES "User" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("requirementDraft" IS NULL OR json_valid("requirementDraft")),
    CHECK ("travellers" BETWEEN -2147483648 AND 2147483647),
    CHECK ("budget" BETWEEN -2147483648 AND 2147483647),
    CHECK ("quotedPrice" BETWEEN -2147483648 AND 2147483647),
    CHECK ("repeatCustomer" IN (0,1)),
    CHECK ("itineraryRequested" IN (0,1))
);

-- CreateTable
CREATE TABLE "Package" (
    "hotelCategory" TEXT NOT NULL DEFAULT '',
    "itinerary" TEXT NOT NULL DEFAULT '',
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "cancellationTerms" TEXT NOT NULL DEFAULT '',
    "rateNotes" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "inclusions" TEXT NOT NULL,
    "exclusions" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "estimatedCost" INTEGER NOT NULL,
    CONSTRAINT "Package_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("days" BETWEEN -2147483648 AND 2147483647),
    CHECK ("price" BETWEEN -2147483648 AND 2147483647),
    CHECK ("estimatedCost" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "Quote" (
    "version" INTEGER NOT NULL DEFAULT 1,
    "proposal" TEXT NOT NULL DEFAULT '',
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "cancellationTerms" TEXT NOT NULL DEFAULT '',
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "travellers" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "travelStart" DATETIME NOT NULL,
    "travelEnd" DATETIME NOT NULL,
    "packageName" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "inclusions" TEXT NOT NULL,
    "exclusions" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "taxBps" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "estimatedCost" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_leadId_agencyId_fkey" FOREIGN KEY ("leadId", "agencyId") REFERENCES "Lead" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Quote_packageId_agencyId_fkey" FOREIGN KEY ("packageId", "agencyId") REFERENCES "Package" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("version" BETWEEN -2147483648 AND 2147483647),
    CHECK ("travellers" BETWEEN -2147483648 AND 2147483647),
    CHECK ("unitPrice" BETWEEN -2147483648 AND 2147483647),
    CHECK ("duration" BETWEEN -2147483648 AND 2147483647),
    CHECK ("discount" BETWEEN -2147483648 AND 2147483647),
    CHECK ("taxBps" BETWEEN -2147483648 AND 2147483647),
    CHECK ("total" BETWEEN -2147483648 AND 2147483647),
    CHECK ("estimatedCost" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "Booking" (
    "costRevision" INTEGER NOT NULL DEFAULT 0,
    "directCostsComplete" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "cancellationFee" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Confirmed',
    "supplierStatus" TEXT NOT NULL DEFAULT 'Pending',
    "dueDate" DATETIME NOT NULL,
    "travelStart" DATETIME NOT NULL,
    "travelEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_leadId_agencyId_fkey" FOREIGN KEY ("leadId", "agencyId") REFERENCES "Lead" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Booking_quoteId_leadId_agencyId_fkey" FOREIGN KEY ("quoteId", "leadId", "agencyId") REFERENCES "Quote" ("id", "leadId", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("costRevision" BETWEEN -2147483648 AND 2147483647),
    CHECK ("directCostsComplete" IN (0,1)),
    CHECK ("total" BETWEEN -2147483648 AND 2147483647),
    CHECK ("cancellationFee" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "Transaction" (
    "dateBasis" TEXT NOT NULL DEFAULT 'CALENDAR',
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requestId" TEXT,
    "requestHash" TEXT,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_bookingId_agencyId_fkey" FOREIGN KEY ("bookingId", "agencyId") REFERENCES "Booking" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("amount">0),
    CHECK ("kind" IN ('Receipt','Refund','Expense','Supplier payment','Supplier credit','Supplier refund')),
    CHECK ("dateBasis" IN ('CALENDAR','INSTANT')),
    CHECK ("amount" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "leadId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Activity_leadId_agencyId_fkey" FOREIGN KEY ("leadId", "agencyId") REFERENCES "Lead" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateTable
CREATE TABLE "Spend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Spend_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("amount" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,
    CHECK ("count" BETWEEN -2147483648 AND 2147483647),
    CHECK ("lastRequest" BETWEEN -9007199254740991 AND 9007199254740991)
);

-- CreateTable
CREATE TABLE "RequestBucket" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CHECK ("count" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    CONSTRAINT "Invitation_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("role" IN ('MANAGER','AGENT'))
);

-- CreateTable
CREATE TABLE "TwoFactor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("verified" IN (0,1)),
    CHECK ("failedVerificationCount" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "ReportingCoverage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Advertising',
    "attestedBy" TEXT NOT NULL,
    "attestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportingCoverage_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SELECT_ACCOUNT',
    "credentials" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationConnection_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("provider" IN ('META','GOOGLE')),
    CHECK ("revision" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "IntegrationAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "verifier" TEXT NOT NULL DEFAULT '',
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IntegrationSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "cursor" TEXT NOT NULL DEFAULT '',
    "staged" JSONB NOT NULL DEFAULT [],
    "revision" INTEGER NOT NULL,
    "leaseToken" TEXT NOT NULL,
    "leaseUntil" DATETIME NOT NULL,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "IntegrationSyncRun_connectionId_agencyId_fkey" FOREIGN KEY ("connectionId", "agencyId") REFERENCES "IntegrationConnection" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("staged" IS NULL OR json_valid("staged")),
    CHECK ("revision" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "AdDailyMetric" (
    "providerConversions" TEXT,
    "conversionDefinition" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL DEFAULT '',
    "adSetName" TEXT NOT NULL DEFAULT '',
    "spendMicros" BIGINT NOT NULL,
    "impressions" BIGINT NOT NULL,
    "clicks" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdDailyMetric_connectionId_agencyId_fkey" FOREIGN KEY ("connectionId", "agencyId") REFERENCES "IntegrationConnection" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("spendMicros">=0),
    CHECK ("impressions">=0),
    CHECK ("clicks">=0),
    CHECK ("spendMicros" BETWEEN -9007199254740991 AND 9007199254740991),
    CHECK ("impressions" BETWEEN -9007199254740991 AND 9007199254740991),
    CHECK ("clicks" BETWEEN -9007199254740991 AND 9007199254740991)
);

-- CreateTable
CREATE TABLE "WhatsAppChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "phoneId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "displayPhone" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WhatsAppChannel_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("enabled" IN (0,1)),
    CHECK ("revision" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parameterCount" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "slots" JSONB NOT NULL DEFAULT [],
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WhatsAppTemplate_channelId_agencyId_fkey" FOREIGN KEY ("channelId", "agencyId") REFERENCES "WhatsAppChannel" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("parameterCount" BETWEEN -2147483648 AND 2147483647),
    CHECK ("slots" IS NULL OR json_valid("slots")),
    CHECK ("revision" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "MessagingConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "optedIn" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ("optedIn" IN (0,1))
);

-- CreateTable
CREATE TABLE "MessagingConsentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "optedIn" BOOLEAN NOT NULL,
    "evidence" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ("optedIn" IN (0,1))
);

-- CreateTable
CREATE TABLE "WhatsAppNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "occurrence" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "templateRevision" INTEGER NOT NULL,
    "channelRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppNotification_channelId_agencyId_fkey" FOREIGN KEY ("channelId", "agencyId") REFERENCES "WhatsAppChannel" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "WhatsAppNotification_templateId_agencyId_fkey" FOREIGN KEY ("templateId", "agencyId") REFERENCES "WhatsAppTemplate" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "WhatsAppNotification_bookingId_agencyId_fkey" FOREIGN KEY ("bookingId", "agencyId") REFERENCES "Booking" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("parameters" IS NULL OR json_valid("parameters")),
    CHECK ("templateRevision" BETWEEN -2147483648 AND 2147483647),
    CHECK ("channelRevision" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "MessagingDeliveryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AutomationPolicy" (
    "agencyId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "ads" BOOLEAN NOT NULL DEFAULT false,
    "reminders" BOOLEAN NOT NULL DEFAULT false,
    "notifications" BOOLEAN NOT NULL DEFAULT false,
    "summaries" BOOLEAN NOT NULL DEFAULT false,
    "alerts" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomationPolicy_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("enabled" IN (0,1)),
    CHECK ("ads" IN (0,1)),
    CHECK ("reminders" IN (0,1)),
    CHECK ("notifications" IN (0,1)),
    CHECK ("summaries" IN (0,1)),
    CHECK ("alerts" IN (0,1)),
    CHECK ("revision" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "policyRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT NOT NULL DEFAULT '',
    "leaseUntil" DATETIME,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "result" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomationJob_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("payload" IS NULL OR json_valid("payload")),
    CHECK ("policyRevision" BETWEEN -2147483648 AND 2147483647),
    CHECK ("attempts" BETWEEN -2147483648 AND 2147483647),
    CHECK ("failures" BETWEEN -2147483648 AND 2147483647),
    CHECK ("result" IS NULL OR json_valid("result"))
);

-- CreateTable
CREATE TABLE "AutomationAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationAttempt_jobId_agencyId_fkey" FOREIGN KEY ("jobId", "agencyId") REFERENCES "AutomationJob" ("id", "agencyId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ("attempt" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "TourProgress" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TourProgress_userId_agencyId_fkey" FOREIGN KEY ("userId", "agencyId") REFERENCES "User" ("id", "agencyId") ON DELETE CASCADE ON UPDATE RESTRICT,
    CHECK ("step">=0),
    CHECK ("status" IN ('ACTIVE','SKIPPED','COMPLETE')),
    CHECK ("version" BETWEEN -2147483648 AND 2147483647),
    CHECK ("step" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "amenities" JSONB NOT NULL DEFAULT [],
    "photoUrls" JSONB NOT NULL DEFAULT [],
    "policies" TEXT NOT NULL DEFAULT '',
    "cancellationPolicy" TEXT NOT NULL DEFAULT '',
    "taxBps" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CHECK ("taxBps" BETWEEN 0 AND 10000),
    CHECK ("status" IN ('DRAFT','PENDING','APPROVED','REJECTED','SUSPENDED')),
    CHECK ("revision">=0),
    CHECK (json_type("amenities")='array'),
    CHECK (json_type("photoUrls")='array'),
    CHECK ("amenities" IS NULL OR json_valid("amenities")),
    CHECK ("photoUrls" IS NULL OR json_valid("photoUrls")),
    CHECK ("taxBps" BETWEEN -2147483648 AND 2147483647),
    CHECK ("revision" BETWEEN -2147483648 AND 2147483647)
);

-- CreateTable
CREATE TABLE "HotelMember" (
    "hotelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("hotelId", "userId"),
    CONSTRAINT "HotelMember_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HotelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("role" IN ('OWNER','MANAGER','VIEWER'))
);

-- CreateTable
CREATE TABLE "HotelRoomCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "totalRooms" INTEGER NOT NULL,
    "maxAdults" INTEGER NOT NULL,
    "maxChildren" INTEGER NOT NULL,
    "maxOccupancy" INTEGER NOT NULL,
    "amenities" JSONB NOT NULL DEFAULT [],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HotelRoomCategory_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("totalRooms" BETWEEN 1 AND 10000),
    CHECK ("maxAdults" BETWEEN 1 AND 20),
    CHECK ("maxChildren" BETWEEN 0 AND 20),
    CHECK ("maxOccupancy" BETWEEN 1 AND 20 AND "maxOccupancy">="maxAdults" AND "maxOccupancy">="maxChildren" AND "maxOccupancy"<="maxAdults"+"maxChildren"),
    CHECK (json_type("amenities")='array'),
    CHECK ("totalRooms" BETWEEN -2147483648 AND 2147483647),
    CHECK ("maxAdults" BETWEEN -2147483648 AND 2147483647),
    CHECK ("maxChildren" BETWEEN -2147483648 AND 2147483647),
    CHECK ("maxOccupancy" BETWEEN -2147483648 AND 2147483647),
    CHECK ("amenities" IS NULL OR json_valid("amenities")),
    CHECK ("active" IN (0,1))
);

-- CreateTable
CREATE TABLE "HotelAuditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HotelAuditEntry_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("revision" BETWEEN -2147483648 AND 2147483647),
    CHECK ("details" IS NULL OR json_valid("details"))
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_agencyId_key" ON "User"("id", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Lead_agencyId_assignedId_enquiryDate_idx" ON "Lead"("agencyId", "assignedId", "enquiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_id_agencyId_key" ON "Lead"("id", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_agencyId_externalId_key" ON "Lead"("agencyId", "externalId");

-- CreateIndex
CREATE INDEX "Package_agencyId_idx" ON "Package"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Package_id_agencyId_key" ON "Package"("id", "agencyId");

-- CreateIndex
CREATE INDEX "Quote_agencyId_idx" ON "Quote"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_agencyId_leadId_version_key" ON "Quote"("agencyId", "leadId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_id_leadId_agencyId_key" ON "Quote"("id", "leadId", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_leadId_key" ON "Booking"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_quoteId_key" ON "Booking"("quoteId");

-- CreateIndex
CREATE INDEX "Booking_agencyId_idx" ON "Booking"("agencyId");

-- CreateIndex
CREATE INDEX "Booking_agencyId_createdAt_idx" ON "Booking"("agencyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_leadId_agencyId_key" ON "Booking"("leadId", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_quoteId_leadId_agencyId_key" ON "Booking"("quoteId", "leadId", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_id_agencyId_key" ON "Booking"("id", "agencyId");

-- CreateIndex
CREATE INDEX "Transaction_agencyId_bookingId_idx" ON "Transaction"("agencyId", "bookingId");

-- CreateIndex
CREATE INDEX "Transaction_agencyId_date_idx" ON "Transaction"("agencyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_agencyId_requestId_key" ON "Transaction"("agencyId", "requestId");

-- CreateIndex
CREATE INDEX "Activity_agencyId_idx" ON "Activity"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Spend_agencyId_month_kind_channel_key" ON "Spend"("agencyId", "month", "kind", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE INDEX "RequestBucket_expiresAt_idx" ON "RequestBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_agencyId_email_status_idx" ON "Invitation"("agencyId", "email", "status");

-- CreateIndex
CREATE INDEX "TwoFactor_userId_idx" ON "TwoFactor"("userId");

-- CreateIndex
CREATE INDEX "TwoFactor_secret_idx" ON "TwoFactor"("secret");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingCoverage_scope_key" ON "ReportingCoverage"("agencyId", "fromDate", "toDate", "source", "timezone", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_agencyId_provider_accountId_key" ON "IntegrationConnection"("agencyId", "provider", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_id_agencyId_key" ON "IntegrationConnection"("id", "agencyId");

-- CreateIndex
CREATE INDEX "IntegrationAuthorization_expiresAt_idx" ON "IntegrationAuthorization"("expiresAt");

-- CreateIndex
CREATE INDEX "IntegrationSyncRun_agencyId_connectionId_createdAt_idx" ON "IntegrationSyncRun"("agencyId", "connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "AdDailyMetric_agencyId_day_idx" ON "AdDailyMetric"("agencyId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AdDailyMetric_dimensions_key" ON "AdDailyMetric"("agencyId", "connectionId", "day", "campaignId", "adSetId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppChannel_phoneId_key" ON "WhatsAppChannel"("phoneId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppChannel_id_agencyId_key" ON "WhatsAppChannel"("id", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_channelId_name_language_key" ON "WhatsAppTemplate"("channelId", "name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_id_agencyId_key" ON "WhatsAppTemplate"("id", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConsent_agencyId_phone_key" ON "MessagingConsent"("agencyId", "phone");

-- CreateIndex
CREATE INDEX "MessagingConsentEvent_agencyId_phone_occurredAt_idx" ON "MessagingConsentEvent"("agencyId", "phone", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNotification_providerMessageId_key" ON "WhatsAppNotification"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_agencyId_status_createdAt_idx" ON "WhatsAppNotification"("agencyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNotification_business_key" ON "WhatsAppNotification"("agencyId", "bookingId", "purpose", "occurrence");

-- CreateIndex
CREATE INDEX "MessagingDeliveryEvent_agencyId_notificationId_idx" ON "MessagingDeliveryEvent"("agencyId", "notificationId");

-- CreateIndex
CREATE INDEX "AutomationJob_status_availableAt_leaseUntil_idx" ON "AutomationJob"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJob_agencyId_key_key" ON "AutomationJob"("agencyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJob_id_agencyId_key" ON "AutomationJob"("id", "agencyId");

-- CreateIndex
CREATE INDEX "AutomationAttempt_agencyId_createdAt_idx" ON "AutomationAttempt"("agencyId", "createdAt");

-- CreateIndex
CREATE INDEX "Hotel_status_createdAt_idx" ON "Hotel"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Hotel_city_status_idx" ON "Hotel"("city", "status");

-- CreateIndex
CREATE INDEX "HotelMember_userId_idx" ON "HotelMember"("userId");

-- CreateIndex
CREATE INDEX "HotelRoomCategory_hotelId_active_idx" ON "HotelRoomCategory"("hotelId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoomCategory_id_hotelId_key" ON "HotelRoomCategory"("id", "hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoomCategory_hotelId_name_key" ON "HotelRoomCategory"("hotelId", "name");

-- CreateIndex
CREATE INDEX "HotelAuditEntry_hotelId_createdAt_idx" ON "HotelAuditEntry"("hotelId", "createdAt");

-- Guard assertions are statements inside the same D1 batch as their writes.
-- CHECK failure rolls back the complete batch. Successful batches delete guards.
CREATE TABLE "_TravelOSAtomicGuard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ok" INTEGER NOT NULL CHECK ("ok"=1)
);

-- Preserve direct-cost coverage invalidation, including direct SQL mutations.
CREATE TRIGGER "booking_cost_insert" AFTER INSERT ON "Transaction"
WHEN NEW."kind" IN ('Expense','Supplier credit') BEGIN
  UPDATE "Booking" SET "directCostsComplete"=0,"costRevision"="costRevision"+1
  WHERE "id"=NEW."bookingId" AND "agencyId"=NEW."agencyId";
END;
CREATE TRIGGER "booking_cost_delete" AFTER DELETE ON "Transaction"
WHEN OLD."kind" IN ('Expense','Supplier credit') BEGIN
  UPDATE "Booking" SET "directCostsComplete"=0,"costRevision"="costRevision"+1
  WHERE "id"=OLD."bookingId" AND "agencyId"=OLD."agencyId";
END;
CREATE TRIGGER "booking_cost_update_old" AFTER UPDATE ON "Transaction"
WHEN OLD."kind" IN ('Expense','Supplier credit') BEGIN
  UPDATE "Booking" SET "directCostsComplete"=0,"costRevision"="costRevision"+1
  WHERE "id"=OLD."bookingId" AND "agencyId"=OLD."agencyId";
END;
CREATE TRIGGER "booking_cost_update_new" AFTER UPDATE ON "Transaction"
WHEN NEW."kind" IN ('Expense','Supplier credit') BEGIN
  UPDATE "Booking" SET "directCostsComplete"=0,"costRevision"="costRevision"+1
  WHERE "id"=NEW."bookingId" AND "agencyId"=NEW."agencyId";
END;

-- Delete attestations whenever advertising totals or their source rows change.
CREATE TRIGGER "advertising_insert" AFTER INSERT ON "Spend"
WHEN NEW."kind"='Advertising' BEGIN
  UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE "id"=NEW."agencyId";
  DELETE FROM "ReportingCoverage" WHERE "agencyId"=NEW."agencyId" AND "kind"='Advertising';
END;
CREATE TRIGGER "advertising_delete" AFTER DELETE ON "Spend"
WHEN OLD."kind"='Advertising' BEGIN
  UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE "id"=OLD."agencyId";
  DELETE FROM "ReportingCoverage" WHERE "agencyId"=OLD."agencyId" AND "kind"='Advertising';
END;
CREATE TRIGGER "advertising_update_old" AFTER UPDATE ON "Spend"
WHEN OLD."kind"='Advertising' BEGIN
  UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE "id"=OLD."agencyId";
  DELETE FROM "ReportingCoverage" WHERE "agencyId"=OLD."agencyId" AND "kind"='Advertising';
END;
CREATE TRIGGER "advertising_update_new" AFTER UPDATE ON "Spend"
WHEN NEW."kind"='Advertising' BEGIN
  UPDATE "Agency" SET "adSpendRevision"="adSpendRevision"+1 WHERE "id"=NEW."agencyId";
  DELETE FROM "ReportingCoverage" WHERE "agencyId"=NEW."agencyId" AND "kind"='Advertising';
END;

