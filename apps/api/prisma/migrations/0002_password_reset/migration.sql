CREATE TYPE "password_reset_delivery_kind" AS ENUM ('code', 'changed');

CREATE TABLE "password_reset_states" (
    "user_id" UUID NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("failed_attempts" >= 0),
    "failure_window_start" TIMESTAMPTZ(3),
    CONSTRAINT "password_reset_states_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "password_reset_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0 AND "attempts" <= 5),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_deliveries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge_id" UUID,
    "kind" "password_reset_delivery_kind" NOT NULL,
    "ciphertext" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_reset_challenges_user_created_idx" ON "password_reset_challenges"("user_id", "created_at");
CREATE INDEX "password_reset_challenges_expiry_idx" ON "password_reset_challenges"("expires_at");
CREATE UNIQUE INDEX "password_reset_grants_challenge_key" ON "password_reset_grants"("challenge_id");
CREATE UNIQUE INDEX "password_reset_grants_token_key" ON "password_reset_grants"("token_hash");
CREATE INDEX "password_reset_grants_user_idx" ON "password_reset_grants"("user_id");
CREATE UNIQUE INDEX "password_reset_deliveries_challenge_key" ON "password_reset_deliveries"("challenge_id");
CREATE INDEX "password_reset_deliveries_pending_idx" ON "password_reset_deliveries"("finished_at", "available_at");
CREATE INDEX "password_reset_deliveries_user_idx" ON "password_reset_deliveries"("user_id");

ALTER TABLE "password_reset_states" ADD CONSTRAINT "password_reset_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_challenges" ADD CONSTRAINT "password_reset_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_grants" ADD CONSTRAINT "password_reset_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_grants" ADD CONSTRAINT "password_reset_grants_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "password_reset_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_deliveries" ADD CONSTRAINT "password_reset_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_deliveries" ADD CONSTRAINT "password_reset_deliveries_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "password_reset_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
