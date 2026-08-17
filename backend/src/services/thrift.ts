// Schema bootstrap for the thrift marketplace.
//
// This repo's drizzle migration history and the live schema have never matched
// (see the note in the billing service), so every table added since then
// creates itself with idempotent DDL on first use. `drizzle/0003_thrift.sql`
// carries the same statements for anyone rebuilding from scratch.
import { neon } from "@neondatabase/serverless";

function sql() {
  return neon(process.env.DATABASE_URL!);
}

let ready: Promise<void> | null = null;

export function ensureThriftSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const q = sql();

    await q`DO $$ BEGIN
      CREATE TYPE "thrift_condition" AS ENUM('like_new','gently_used','used');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN
      CREATE TYPE "thrift_delivery" AS ENUM('pickup','shipping','either');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN
      CREATE TYPE "thrift_listing_status" AS ENUM('draft','active','paused','sold','removed');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN
      CREATE TYPE "thrift_conversation_status" AS ENUM('active','closed','blocked');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN
      CREATE TYPE "thrift_report_status" AS ENUM('open','reviewed','resolved','dismissed');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;

    await q`CREATE TABLE IF NOT EXISTS "thrift_listings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "seller_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      -- Not a cascade: a completed sale deletes the seller's garment, and a
      -- cascade here would erase the listing and, through it, the sale record.
      "source_cloth_id" uuid NOT NULL,
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
    )`;

    // One open listing per wardrobe piece. Partial, so a piece can be listed
    // again after a previous listing was sold or removed — which is the point
    // of keeping sold rows around rather than deleting them.
    await q`ALTER TABLE "thrift_listings"
      DROP CONSTRAINT IF EXISTS "thrift_listings_source_cloth_id_fkey"`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "thrift_listings_one_open_idx"
      ON "thrift_listings" ("source_cloth_id")
      WHERE "status" IN ('draft','active','paused')`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_listings_seller_idx" ON "thrift_listings" ("seller_user_id")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_listings_browse_idx" ON "thrift_listings" ("status","created_at" DESC)`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_listings_category_idx" ON "thrift_listings" ("status","category")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_listings_price_idx" ON "thrift_listings" ("status","price_paise")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_listings_style_idx" ON "thrift_listings" ("status","style_tag")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_listings_size_idx" ON "thrift_listings" ("status","size")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_listings_cloth_idx" ON "thrift_listings" ("source_cloth_id")`;

    await q`CREATE TABLE IF NOT EXISTS "thrift_saves" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "listing_id" uuid NOT NULL REFERENCES "thrift_listings"("id") ON DELETE CASCADE,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "thrift_saves_pair_idx" ON "thrift_saves" ("user_id","listing_id")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_saves_user_idx" ON "thrift_saves" ("user_id")`;

    await q`CREATE TABLE IF NOT EXISTS "thrift_conversations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "listing_id" uuid NOT NULL REFERENCES "thrift_listings"("id") ON DELETE CASCADE,
      "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "seller_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "status" "thrift_conversation_status" NOT NULL DEFAULT 'active',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "thrift_conversations_pair_idx" ON "thrift_conversations" ("listing_id","buyer_user_id")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_conversations_buyer_idx" ON "thrift_conversations" ("buyer_user_id","updated_at" DESC)`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_conversations_seller_idx" ON "thrift_conversations" ("seller_user_id","updated_at" DESC)`;

    await q`CREATE TABLE IF NOT EXISTS "thrift_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid NOT NULL REFERENCES "thrift_conversations"("id") ON DELETE CASCADE,
      "sender_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "body" text NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "read_at" timestamptz
    )`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_messages_conv_idx" ON "thrift_messages" ("conversation_id","created_at")`;

    await q`CREATE TABLE IF NOT EXISTS "thrift_listing_reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "reporter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "listing_id" uuid NOT NULL REFERENCES "thrift_listings"("id") ON DELETE CASCADE,
      "reason" text NOT NULL,
      "note" text,
      "status" "thrift_report_status" NOT NULL DEFAULT 'open',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_listing_reports_listing_idx" ON "thrift_listing_reports" ("listing_id")`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "thrift_listing_reports_once_idx" ON "thrift_listing_reports" ("reporter_user_id","listing_id")`;

    await q`CREATE TABLE IF NOT EXISTS "thrift_conversation_reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "reporter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "conversation_id" uuid NOT NULL REFERENCES "thrift_conversations"("id") ON DELETE CASCADE,
      "reason" text NOT NULL,
      "note" text,
      "status" "thrift_report_status" NOT NULL DEFAULT 'open',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_conversation_reports_conv_idx" ON "thrift_conversation_reports" ("conversation_id")`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "thrift_conversation_reports_once_idx" ON "thrift_conversation_reports" ("reporter_user_id","conversation_id")`;

    await q`CREATE TABLE IF NOT EXISTS "thrift_blocks" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "blocker_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "blocked_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "thrift_blocks_pair_idx" ON "thrift_blocks" ("blocker_user_id","blocked_user_id")`;
    await q`CREATE INDEX IF NOT EXISTS "thrift_blocks_blocked_idx" ON "thrift_blocks" ("blocked_user_id")`;
  })().catch((err) => {
    // Let the next request retry rather than caching a failed bootstrap.
    ready = null;
    throw err;
  });
  return ready;
}

/** Statuses a buyer may see and interact with. */
export const OPEN_STATUSES = ["active"] as const;

/** Statuses that still hold the wardrobe piece off the market. */
export const HELD_STATUSES = ["draft", "active", "paused"] as const;

export const CLOSED_MESSAGE: Record<string, string> = {
  sold: "This item has been sold. This conversation is now closed.",
  paused: "This listing is currently unavailable.",
  removed: "This listing is no longer available.",
  draft: "This listing is not published yet.",
};

/** Rupees for display; paise everywhere in storage and transport. */
export function rupees(paise: number): number {
  return Math.round(paise) / 100;
}
