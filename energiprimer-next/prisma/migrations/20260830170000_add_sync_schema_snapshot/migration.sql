-- Additive schema snapshot storage for synchronization review.
-- No existing operational table or row is altered or deleted.

ALTER TABLE "sync_worksheets"
ADD COLUMN "schema_snapshot" TEXT;
