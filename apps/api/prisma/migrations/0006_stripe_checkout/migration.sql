-- Existing Mercado Pago attempts keep their provider and idempotency key.
ALTER TYPE "billing_provider_api" ADD VALUE 'stripe';
ALTER TABLE "billing_payments"
  ALTER COLUMN "provider_id" TYPE VARCHAR(255),
  ADD COLUMN "checkout_url" TEXT;
