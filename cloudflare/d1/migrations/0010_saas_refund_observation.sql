-- Preserve the provider's verified cumulative refund total on each new adjustment.
-- Existing immutable rows remain unchanged; zero means no cumulative observation was stored.
ALTER TABLE SaaSTestRefund ADD COLUMN observedTotal INTEGER NOT NULL DEFAULT 0 CHECK(observedTotal BETWEEN 0 AND 100000000);
