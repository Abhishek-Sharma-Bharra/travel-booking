-- Test-only SaaS billing. No production entitlement, booking or real-money tables are changed.
CREATE TABLE SaaSTestCheckout (
 id TEXT PRIMARY KEY,agencyId TEXT NOT NULL REFERENCES Agency(id),actorId TEXT NOT NULL REFERENCES User(id),
 requestId TEXT NOT NULL,payloadHash TEXT NOT NULL,planCode TEXT NOT NULL,snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 100 AND 100000000),currency TEXT NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 providerKeyId TEXT NOT NULL CHECK(substr(providerKeyId,1,9)='rzp_test_'),providerSubscriptionId TEXT UNIQUE,
 state TEXT NOT NULL CHECK(state IN('RESERVED','READY','UNKNOWN','SUBSCRIBED','HALTED','CLOSED')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,
 UNIQUE(agencyId,requestId),UNIQUE(id,agencyId),CHECK(json_extract(snapshot,'$.amountPaise')=amount)
);
CREATE UNIQUE INDEX SaaSTestCheckout_one_open ON SaaSTestCheckout(agencyId) WHERE state IN('RESERVED','READY','UNKNOWN','SUBSCRIBED','HALTED');
CREATE INDEX SaaSTestCheckout_scope ON SaaSTestCheckout(agencyId,createdAt);
CREATE TRIGGER SaaSTestCheckout_snapshot BEFORE UPDATE ON SaaSTestCheckout WHEN NEW.id<>OLD.id OR NEW.agencyId<>OLD.agencyId OR NEW.actorId<>OLD.actorId OR NEW.requestId<>OLD.requestId OR NEW.payloadHash<>OLD.payloadHash OR NEW.planCode<>OLD.planCode OR NEW.snapshot<>OLD.snapshot OR NEW.amount<>OLD.amount OR NEW.currency<>OLD.currency OR NEW.providerKeyId<>OLD.providerKeyId OR NEW.createdAt<>OLD.createdAt OR (OLD.providerSubscriptionId IS NOT NULL AND (NEW.providerSubscriptionId IS NULL OR NEW.providerSubscriptionId<>OLD.providerSubscriptionId)) BEGIN SELECT RAISE(ABORT,'Sandbox checkout snapshot is immutable'); END;
CREATE TABLE SaaSTestPayment (
 id TEXT PRIMARY KEY,agencyId TEXT NOT NULL,checkoutId TEXT NOT NULL,providerPaymentId TEXT NOT NULL UNIQUE,providerInvoiceId TEXT NOT NULL UNIQUE,
 amount INTEGER NOT NULL CHECK(amount BETWEEN 100 AND 100000000),currency TEXT NOT NULL CHECK(currency='INR'),
 periodStart TEXT NOT NULL,periodEnd TEXT NOT NULL CHECK(periodEnd>periodStart),verifiedAt TEXT NOT NULL,refundedAtVerification INTEGER NOT NULL DEFAULT 0 CHECK(refundedAtVerification BETWEEN 0 AND amount),
 FOREIGN KEY(checkoutId,agencyId) REFERENCES SaaSTestCheckout(id,agencyId),UNIQUE(id,agencyId)
);
CREATE INDEX SaaSTestPayment_scope ON SaaSTestPayment(agencyId,periodEnd);
CREATE TABLE SaaSTestRefund (
 id TEXT PRIMARY KEY,agencyId TEXT NOT NULL,paymentId TEXT NOT NULL,providerRefundId TEXT NOT NULL UNIQUE,
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 100000000),verifiedAt TEXT NOT NULL,
 FOREIGN KEY(paymentId,agencyId) REFERENCES SaaSTestPayment(id,agencyId)
);
CREATE INDEX SaaSTestRefund_scope ON SaaSTestRefund(agencyId,paymentId);
CREATE TABLE SaaSTestWebhook (
 eventId TEXT PRIMARY KEY,payloadHash TEXT NOT NULL UNIQUE,eventType TEXT NOT NULL,checkoutId TEXT NOT NULL REFERENCES SaaSTestCheckout(id),createdAt TEXT NOT NULL
);
CREATE TRIGGER SaaSTestPayment_no_update BEFORE UPDATE ON SaaSTestPayment BEGIN SELECT RAISE(ABORT,'Sandbox payment ledger is immutable'); END;
CREATE TRIGGER SaaSTestPayment_no_delete BEFORE DELETE ON SaaSTestPayment BEGIN SELECT RAISE(ABORT,'Sandbox payment ledger is immutable'); END;
CREATE TRIGGER SaaSTestRefund_no_update BEFORE UPDATE ON SaaSTestRefund BEGIN SELECT RAISE(ABORT,'Sandbox refund ledger is immutable'); END;
CREATE TRIGGER SaaSTestRefund_no_delete BEFORE DELETE ON SaaSTestRefund BEGIN SELECT RAISE(ABORT,'Sandbox refund ledger is immutable'); END;
CREATE TRIGGER SaaSTestWebhook_no_update BEFORE UPDATE ON SaaSTestWebhook BEGIN SELECT RAISE(ABORT,'Sandbox webhook ledger is immutable'); END;
CREATE TRIGGER SaaSTestWebhook_no_delete BEFORE DELETE ON SaaSTestWebhook BEGIN SELECT RAISE(ABORT,'Sandbox webhook ledger is immutable'); END;
