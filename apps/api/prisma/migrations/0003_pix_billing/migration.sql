BEGIN;

CREATE TYPE "billing_plan" AS ENUM ('free', 'pro', 'business');
CREATE TYPE "billing_payment_status" AS ENUM ('creating', 'pending', 'approved', 'expired', 'cancelled', 'rejected', 'refunded');

CREATE TABLE "billing_payments" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "plan" "billing_plan" NOT NULL,
  "price_cents" INTEGER NOT NULL,
  "job_limit" INTEGER NOT NULL,
  "status" "billing_payment_status" NOT NULL DEFAULT 'creating',
  "provider_id" VARCHAR(64),
  "payer_email" VARCHAR(320) NOT NULL,
  "payer_name" VARCHAR(120) NOT NULL,
  "payer_document" VARCHAR(11),
  "qr_code" TEXT,
  "qr_code_base64" TEXT,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "approved_at" TIMESTAMPTZ(3),
  "provider_updated_at" TIMESTAMPTZ(3),
  "last_checked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_payments_positive_values" CHECK ("price_cents" > 0 AND "job_limit" > 0 AND "plan" <> 'free'),
  CONSTRAINT "billing_payments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "billing_payments_provider_id_key" ON "billing_payments"("provider_id");
CREATE INDEX "billing_payments_owner_created_idx" ON "billing_payments"("owner_id", "created_at");
CREATE INDEX "billing_payments_reconcile_idx" ON "billing_payments"("status", "last_checked_at");
CREATE UNIQUE INDEX "billing_payments_one_pending_per_owner" ON "billing_payments"("owner_id") WHERE "status" IN ('creating', 'pending');

CREATE TABLE "billing_periods" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "plan" "billing_plan" NOT NULL,
  "job_limit" INTEGER NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_periods_valid_dates" CHECK ("ends_at" > "starts_at" AND "job_limit" > 0 AND "plan" <> 'free'),
  CONSTRAINT "billing_periods_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "billing_periods_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "billing_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "billing_periods_payment_id_key" ON "billing_periods"("payment_id");
CREATE INDEX "billing_periods_owner_dates_idx" ON "billing_periods"("owner_id", "starts_at", "ends_at");

CREATE TABLE "approval_usage" (
  "job_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "period_id" UUID,
  "free_month" VARCHAR(7),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_usage_pkey" PRIMARY KEY ("job_id"),
  CONSTRAINT "approval_usage_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approval_usage_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approval_usage_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "billing_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "approval_usage_free_month_idx" ON "approval_usage"("owner_id", "free_month");
CREATE INDEX "approval_usage_period_idx" ON "approval_usage"("period_id");

-- Existing shared jobs remain eligible for free link rotation. No retroactive quota.
INSERT INTO "approval_usage" ("job_id", "owner_id", "created_at")
SELECT j."id", j."owner_id", MIN(a."created_at")
FROM "jobs" j JOIN "approval_links" a ON a."job_id" = j."id"
GROUP BY j."id", j."owner_id";

COMMIT;
