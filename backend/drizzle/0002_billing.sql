-- Billing: profiles, credit ledger, payments.
--
-- Written by hand and idempotently, for the same reason as 0001: this
-- database has no drizzle.__drizzle_migrations table, so the file-based
-- migrator has never run here and `drizzle-kit generate` produces a full
-- catch-up against a stale snapshot. The application also applies these
-- statements on first use (services/billing/credits.ts → ensureBillingSchema),
-- following the pattern already used by tryon_assets, so no manual step is
-- required for a deploy.

DO $$ BEGIN CREATE TYPE "billing_tier" AS ENUM('free','lite','plus','style'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "subscription_status" AS ENUM('none','pending','active','past_due','cancelled','expired'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "credit_ledger_type" AS ENUM('free_monthly_grant','pack_purchase_grant','subscription_grant','tryon_debit','regenerate_debit','generation_refund','admin_adjustment','expiry'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "credit_source" AS ENUM('free','pack','subscription','tryon','regenerate','refund'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "payment_kind" AS ENUM('pack','subscription'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "payment_status" AS ENUM('created','pending','paid','failed','refunded','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "billing_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "current_tier" "billing_tier" NOT NULL DEFAULT 'free',
  "subscription_status" "subscription_status" NOT NULL DEFAULT 'none',
  "razorpay_customer_id" text,
  "razorpay_subscription_id" text,
  "subscription_started_at" timestamptz,
  "subscription_current_period_start" timestamptz,
  "subscription_current_period_end" timestamptz,
  "subscription_cancelled_at" timestamptz,
  "free_allowance_period_start" timestamptz,
  "free_allowance_period_end" timestamptz,
  "free_chat_period_start" timestamptz,
  "free_chat_period_end" timestamptz,
  "free_chat_used" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_profiles_user_idx" ON "billing_profiles" ("user_id");

CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "credit_ledger_type" NOT NULL,
  "credit_amount" integer NOT NULL,
  "source_type" "credit_source" NOT NULL,
  "product_code" text,
  "related_tryon_id" uuid,
  "related_payment_id" uuid,
  "expires_at" timestamptz,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_idem_idx" ON "credit_ledger" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "credit_ledger_user_idx" ON "credit_ledger" ("user_id");
CREATE INDEX IF NOT EXISTS "credit_ledger_expiry_idx" ON "credit_ledger" ("user_id","expires_at");
CREATE INDEX IF NOT EXISTS "credit_ledger_created_idx" ON "credit_ledger" ("user_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL DEFAULT 'razorpay',
  "product_code" text NOT NULL,
  "kind" "payment_kind" NOT NULL,
  "amount_paise" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'INR',
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "razorpay_subscription_id" text,
  "status" "payment_status" NOT NULL DEFAULT 'created',
  "webhook_event_id" text,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payments_user_idx" ON "payments" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_order_idx" ON "payments" ("razorpay_order_id") WHERE "razorpay_order_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_event_idx" ON "payments" ("webhook_event_id") WHERE "webhook_event_id" IS NOT NULL;
