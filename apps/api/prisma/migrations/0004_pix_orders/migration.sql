BEGIN;

CREATE TYPE "billing_provider_api" AS ENUM ('payments', 'orders');

-- Preserve the provider and idempotency namespace of every existing attempt,
-- including Payments requests whose HTTP response was lost before saving the ID.
ALTER TABLE "billing_payments"
  ADD COLUMN "provider_api" "billing_provider_api" NOT NULL DEFAULT 'payments';
ALTER TABLE "billing_payments"
  ALTER COLUMN "provider_api" SET DEFAULT 'orders';

COMMIT;
