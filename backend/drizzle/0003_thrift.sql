-- 0003_thrift.sql — peer-to-peer thrift marketplace.
-- Mirrors ensureThriftSchema() in src/services/thrift.ts, which applies the
-- same statements at runtime. Every statement is idempotent.

DO $$ BEGIN
      CREATE TYPE "thrift_condition" AS ENUM('like_new','gently_used','used');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
      CREATE TYPE "thrift_delivery" AS ENUM('pickup','shipping','either');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
      CREATE TYPE "thrift_listing_status" AS ENUM('draft','active','paused','sold','removed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
      CREATE TYPE "thrift_conversation_status" AS ENUM('active','closed','blocked');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
      CREATE TYPE "thrift_report_status" AS ENUM('open','reviewed','resolved','dismissed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "thrift_listings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "seller_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "source_cloth_id" uuid NOT NULL REFERENCES "clothes"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "price_paise" integer NOT NULL,
      "currency" text NOT NULL DEFAULT 'INR',
      "size" text NOT NULL,
      "condition" "thrift_condition" NOT NULL,
      "brand" text,
      "description" text,
      "delivery_preference" "thrift_delivery" NOT NULL,
      "city" text,
      "status" "thrift_listing_status" NOT NULL DEFAULT 'active',
      "image_url" text NOT NULL,
      "category" text NOT NULL,
      "style_tag" "style_tag",
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "sold_at" timestamptz
    );

CREATE UNIQUE INDEX IF NOT EXISTS "thrift_listings_one_open_idx"
      ON "thrift_listings" ("source_cloth_id")
      WHERE "status" IN ('draft','active','paused');

CREATE INDEX IF NOT EXISTS "thrift_listings_seller_idx" ON "thrift_listings" ("seller_user_id");

CREATE INDEX IF NOT EXISTS "thrift_listings_browse_idx" ON "thrift_listings" ("status","created_at" DESC);

CREATE INDEX IF NOT EXISTS "thrift_listings_category_idx" ON "thrift_listings" ("status","category");

CREATE INDEX IF NOT EXISTS "thrift_listings_price_idx" ON "thrift_listings" ("status","price_paise");

CREATE INDEX IF NOT EXISTS "thrift_listings_style_idx" ON "thrift_listings" ("status","style_tag");

CREATE INDEX IF NOT EXISTS "thrift_listings_size_idx" ON "thrift_listings" ("status","size");

CREATE INDEX IF NOT EXISTS "thrift_listings_cloth_idx" ON "thrift_listings" ("source_cloth_id");

CREATE TABLE IF NOT EXISTS "thrift_saves" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "listing_id" uuid NOT NULL REFERENCES "thrift_listings"("id") ON DELETE CASCADE,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );

CREATE UNIQUE INDEX IF NOT EXISTS "thrift_saves_pair_idx" ON "thrift_saves" ("user_id","listing_id");

CREATE INDEX IF NOT EXISTS "thrift_saves_user_idx" ON "thrift_saves" ("user_id");

CREATE TABLE IF NOT EXISTS "thrift_conversations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "listing_id" uuid NOT NULL REFERENCES "thrift_listings"("id") ON DELETE CASCADE,
      "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "seller_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "status" "thrift_conversation_status" NOT NULL DEFAULT 'active',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );

CREATE UNIQUE INDEX IF NOT EXISTS "thrift_conversations_pair_idx" ON "thrift_conversations" ("listing_id","buyer_user_id");

CREATE INDEX IF NOT EXISTS "thrift_conversations_buyer_idx" ON "thrift_conversations" ("buyer_user_id","updated_at" DESC);

CREATE INDEX IF NOT EXISTS "thrift_conversations_seller_idx" ON "thrift_conversations" ("seller_user_id","updated_at" DESC);

CREATE TABLE IF NOT EXISTS "thrift_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid NOT NULL REFERENCES "thrift_conversations"("id") ON DELETE CASCADE,
      "sender_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "body" text NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "read_at" timestamptz
    );

CREATE INDEX IF NOT EXISTS "thrift_messages_conv_idx" ON "thrift_messages" ("conversation_id","created_at");

CREATE TABLE IF NOT EXISTS "thrift_listing_reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "reporter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "listing_id" uuid NOT NULL REFERENCES "thrift_listings"("id") ON DELETE CASCADE,
      "reason" text NOT NULL,
      "note" text,
      "status" "thrift_report_status" NOT NULL DEFAULT 'open',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS "thrift_listing_reports_listing_idx" ON "thrift_listing_reports" ("listing_id");

CREATE UNIQUE INDEX IF NOT EXISTS "thrift_listing_reports_once_idx" ON "thrift_listing_reports" ("reporter_user_id","listing_id");

CREATE TABLE IF NOT EXISTS "thrift_conversation_reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "reporter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "conversation_id" uuid NOT NULL REFERENCES "thrift_conversations"("id") ON DELETE CASCADE,
      "reason" text NOT NULL,
      "note" text,
      "status" "thrift_report_status" NOT NULL DEFAULT 'open',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS "thrift_conversation_reports_conv_idx" ON "thrift_conversation_reports" ("conversation_id");

CREATE UNIQUE INDEX IF NOT EXISTS "thrift_conversation_reports_once_idx" ON "thrift_conversation_reports" ("reporter_user_id","conversation_id");

CREATE TABLE IF NOT EXISTS "thrift_blocks" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "blocker_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "blocked_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );

CREATE UNIQUE INDEX IF NOT EXISTS "thrift_blocks_pair_idx" ON "thrift_blocks" ("blocker_user_id","blocked_user_id");

CREATE INDEX IF NOT EXISTS "thrift_blocks_blocked_idx" ON "thrift_blocks" ("blocked_user_id");
