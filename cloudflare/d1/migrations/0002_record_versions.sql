-- Row-version guards for D1 atomic batches. No application records are copied.
-- Tombstones persist so delete/reinsert cannot defeat stale reads.
CREATE TABLE "_D1RecordVersion" (
 "model" TEXT NOT NULL, "id" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY ("model","id")
);
CREATE TRIGGER "record_version_Agency_insert" AFTER INSERT ON "Agency" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Agency',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Agency_update" AFTER UPDATE ON "Agency" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Agency',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Agency_delete" AFTER DELETE ON "Agency" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Agency',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_User_insert" AFTER INSERT ON "User" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('User',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_User_update" AFTER UPDATE ON "User" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('User',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_User_delete" AFTER DELETE ON "User" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('User',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Session_insert" AFTER INSERT ON "Session" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Session',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Session_update" AFTER UPDATE ON "Session" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Session',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Session_delete" AFTER DELETE ON "Session" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Session',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Account_insert" AFTER INSERT ON "Account" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Account',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Account_update" AFTER UPDATE ON "Account" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Account',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Account_delete" AFTER DELETE ON "Account" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Account',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Verification_insert" AFTER INSERT ON "Verification" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Verification',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Verification_update" AFTER UPDATE ON "Verification" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Verification',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Verification_delete" AFTER DELETE ON "Verification" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Verification',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Lead_insert" AFTER INSERT ON "Lead" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Lead',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Lead_update" AFTER UPDATE ON "Lead" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Lead',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Lead_delete" AFTER DELETE ON "Lead" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Lead',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Package_insert" AFTER INSERT ON "Package" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Package',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Package_update" AFTER UPDATE ON "Package" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Package',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Package_delete" AFTER DELETE ON "Package" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Package',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Quote_insert" AFTER INSERT ON "Quote" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Quote',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Quote_update" AFTER UPDATE ON "Quote" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Quote',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Quote_delete" AFTER DELETE ON "Quote" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Quote',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Booking_insert" AFTER INSERT ON "Booking" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Booking',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Booking_update" AFTER UPDATE ON "Booking" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Booking',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Booking_delete" AFTER DELETE ON "Booking" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Booking',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Transaction_insert" AFTER INSERT ON "Transaction" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Transaction',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Transaction_update" AFTER UPDATE ON "Transaction" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Transaction',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Transaction_delete" AFTER DELETE ON "Transaction" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Transaction',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Activity_insert" AFTER INSERT ON "Activity" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Activity',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Activity_update" AFTER UPDATE ON "Activity" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Activity',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Activity_delete" AFTER DELETE ON "Activity" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Activity',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Spend_insert" AFTER INSERT ON "Spend" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Spend',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Spend_update" AFTER UPDATE ON "Spend" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Spend',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Spend_delete" AFTER DELETE ON "Spend" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Spend',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_RateLimit_insert" AFTER INSERT ON "RateLimit" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('RateLimit',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_RateLimit_update" AFTER UPDATE ON "RateLimit" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('RateLimit',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_RateLimit_delete" AFTER DELETE ON "RateLimit" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('RateLimit',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_RequestBucket_insert" AFTER INSERT ON "RequestBucket" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('RequestBucket',CAST(NEW."key" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_RequestBucket_update" AFTER UPDATE ON "RequestBucket" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('RequestBucket',CAST(NEW."key" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_RequestBucket_delete" AFTER DELETE ON "RequestBucket" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('RequestBucket',CAST(OLD."key" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Invitation_insert" AFTER INSERT ON "Invitation" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Invitation',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Invitation_update" AFTER UPDATE ON "Invitation" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Invitation',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Invitation_delete" AFTER DELETE ON "Invitation" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Invitation',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_TwoFactor_insert" AFTER INSERT ON "TwoFactor" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('TwoFactor',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_TwoFactor_update" AFTER UPDATE ON "TwoFactor" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('TwoFactor',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_TwoFactor_delete" AFTER DELETE ON "TwoFactor" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('TwoFactor',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_ReportingCoverage_insert" AFTER INSERT ON "ReportingCoverage" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('ReportingCoverage',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_ReportingCoverage_update" AFTER UPDATE ON "ReportingCoverage" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('ReportingCoverage',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_ReportingCoverage_delete" AFTER DELETE ON "ReportingCoverage" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('ReportingCoverage',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationConnection_insert" AFTER INSERT ON "IntegrationConnection" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationConnection',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationConnection_update" AFTER UPDATE ON "IntegrationConnection" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationConnection',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationConnection_delete" AFTER DELETE ON "IntegrationConnection" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationConnection',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationAuthorization_insert" AFTER INSERT ON "IntegrationAuthorization" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationAuthorization',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationAuthorization_update" AFTER UPDATE ON "IntegrationAuthorization" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationAuthorization',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationAuthorization_delete" AFTER DELETE ON "IntegrationAuthorization" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationAuthorization',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationSyncRun_insert" AFTER INSERT ON "IntegrationSyncRun" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationSyncRun',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationSyncRun_update" AFTER UPDATE ON "IntegrationSyncRun" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationSyncRun',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_IntegrationSyncRun_delete" AFTER DELETE ON "IntegrationSyncRun" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('IntegrationSyncRun',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AdDailyMetric_insert" AFTER INSERT ON "AdDailyMetric" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AdDailyMetric',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AdDailyMetric_update" AFTER UPDATE ON "AdDailyMetric" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AdDailyMetric',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AdDailyMetric_delete" AFTER DELETE ON "AdDailyMetric" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AdDailyMetric',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppChannel_insert" AFTER INSERT ON "WhatsAppChannel" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppChannel',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppChannel_update" AFTER UPDATE ON "WhatsAppChannel" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppChannel',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppChannel_delete" AFTER DELETE ON "WhatsAppChannel" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppChannel',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppTemplate_insert" AFTER INSERT ON "WhatsAppTemplate" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppTemplate',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppTemplate_update" AFTER UPDATE ON "WhatsAppTemplate" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppTemplate',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppTemplate_delete" AFTER DELETE ON "WhatsAppTemplate" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppTemplate',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingConsent_insert" AFTER INSERT ON "MessagingConsent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingConsent',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingConsent_update" AFTER UPDATE ON "MessagingConsent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingConsent',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingConsent_delete" AFTER DELETE ON "MessagingConsent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingConsent',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingConsentEvent_insert" AFTER INSERT ON "MessagingConsentEvent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingConsentEvent',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingConsentEvent_update" AFTER UPDATE ON "MessagingConsentEvent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingConsentEvent',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingConsentEvent_delete" AFTER DELETE ON "MessagingConsentEvent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingConsentEvent',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppNotification_insert" AFTER INSERT ON "WhatsAppNotification" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppNotification',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppNotification_update" AFTER UPDATE ON "WhatsAppNotification" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppNotification',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_WhatsAppNotification_delete" AFTER DELETE ON "WhatsAppNotification" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('WhatsAppNotification',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingDeliveryEvent_insert" AFTER INSERT ON "MessagingDeliveryEvent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingDeliveryEvent',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingDeliveryEvent_update" AFTER UPDATE ON "MessagingDeliveryEvent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingDeliveryEvent',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_MessagingDeliveryEvent_delete" AFTER DELETE ON "MessagingDeliveryEvent" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('MessagingDeliveryEvent',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationPolicy_insert" AFTER INSERT ON "AutomationPolicy" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationPolicy',CAST(NEW."agencyId" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationPolicy_update" AFTER UPDATE ON "AutomationPolicy" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationPolicy',CAST(NEW."agencyId" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationPolicy_delete" AFTER DELETE ON "AutomationPolicy" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationPolicy',CAST(OLD."agencyId" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationJob_insert" AFTER INSERT ON "AutomationJob" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationJob',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationJob_update" AFTER UPDATE ON "AutomationJob" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationJob',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationJob_delete" AFTER DELETE ON "AutomationJob" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationJob',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationAttempt_insert" AFTER INSERT ON "AutomationAttempt" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationAttempt',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationAttempt_update" AFTER UPDATE ON "AutomationAttempt" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationAttempt',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_AutomationAttempt_delete" AFTER DELETE ON "AutomationAttempt" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('AutomationAttempt',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_TourProgress_insert" AFTER INSERT ON "TourProgress" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('TourProgress',CAST(NEW."userId" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_TourProgress_update" AFTER UPDATE ON "TourProgress" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('TourProgress',CAST(NEW."userId" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_TourProgress_delete" AFTER DELETE ON "TourProgress" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('TourProgress',CAST(OLD."userId" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Hotel_insert" AFTER INSERT ON "Hotel" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Hotel',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Hotel_update" AFTER UPDATE ON "Hotel" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Hotel',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_Hotel_delete" AFTER DELETE ON "Hotel" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Hotel',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelMember_insert" AFTER INSERT ON "HotelMember" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelMember',json_array(NEW."hotelId",NEW."userId"),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelMember_update" AFTER UPDATE ON "HotelMember" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelMember',json_array(NEW."hotelId",NEW."userId"),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelMember_delete" AFTER DELETE ON "HotelMember" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelMember',json_array(OLD."hotelId",OLD."userId"),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelRoomCategory_insert" AFTER INSERT ON "HotelRoomCategory" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelRoomCategory',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelRoomCategory_update" AFTER UPDATE ON "HotelRoomCategory" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelRoomCategory',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelRoomCategory_delete" AFTER DELETE ON "HotelRoomCategory" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelRoomCategory',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelAuditEntry_insert" AFTER INSERT ON "HotelAuditEntry" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelAuditEntry',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelAuditEntry_update" AFTER UPDATE ON "HotelAuditEntry" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelAuditEntry',CAST(NEW."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "record_version_HotelAuditEntry_delete" AFTER DELETE ON "HotelAuditEntry" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('HotelAuditEntry',CAST(OLD."id" AS TEXT),1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;

-- All ledger changes invalidate the parent booking snapshot, including receipts
-- and refunds. Financial guards then need only bounded aggregate reads.
CREATE TRIGGER "ledger_booking_version_insert_new" AFTER INSERT ON "Transaction" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Booking',NEW."bookingId",1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "ledger_booking_version_update_old" AFTER UPDATE ON "Transaction" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Booking',OLD."bookingId",1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "ledger_booking_version_update_new" AFTER UPDATE ON "Transaction" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Booking',NEW."bookingId",1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
CREATE TRIGGER "ledger_booking_version_delete_old" AFTER DELETE ON "Transaction" BEGIN
 INSERT INTO "_D1RecordVersion" ("model","id","version") VALUES ('Booking',OLD."bookingId",1)
 ON CONFLICT ("model","id") DO UPDATE SET "version"="version"+1;
END;
