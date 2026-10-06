BEGIN;

ALTER TABLE "billing_payments"
  ADD COLUMN "payer_device_id" VARCHAR(256),
  ADD COLUMN "rejection_reason" VARCHAR(32),
  ADD COLUMN "rejected_at" TIMESTAMPTZ(3);

-- Existing refusals have no retained provider reason. Preserve that uncertainty.
UPDATE "billing_payments"
SET "rejected_at" = "updated_at"
WHERE "status" = 'rejected';

COMMIT;
