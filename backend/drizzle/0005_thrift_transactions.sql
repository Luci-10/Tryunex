-- 0005_thrift_transactions.sql — thrift sale + wardrobe transfer.
-- Mirrors ensureTransferSchema() in src/services/thriftTransfer.ts.

DO $$ BEGIN
  CREATE TYPE "thrift_tx_status" AS ENUM('pending','completed','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "thrift_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "listing_id" uuid NOT NULL REFERENCES "thrift_listings"("id") ON DELETE CASCADE,
  "seller_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Deliberately not a foreign key; see the note in thriftTransfer.ts.
  "source_cloth_id" uuid NOT NULL,
  "status" "thrift_tx_status" NOT NULL DEFAULT 'pending',
  "seller_confirmed_at" timestamptz,
  "buyer_confirmed_at" timestamptz,
  "payment_ref" text,
  "transferred_cloth_id" uuid,
  "transferred_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

-- A garment leaving the seller's wardrobe must not erase the sale that caused
-- it. Both of these cascades did exactly that.
ALTER TABLE "thrift_transactions" DROP CONSTRAINT IF EXISTS "thrift_transactions_source_cloth_id_fkey";
ALTER TABLE "thrift_listings"     DROP CONSTRAINT IF EXISTS "thrift_listings_source_cloth_id_fkey";

CREATE UNIQUE INDEX IF NOT EXISTS "thrift_tx_one_open_idx"
  ON "thrift_transactions" ("listing_id") WHERE "status" IN ('pending','completed');
CREATE INDEX IF NOT EXISTS "thrift_tx_buyer_idx"  ON "thrift_transactions" ("buyer_user_id");
CREATE INDEX IF NOT EXISTS "thrift_tx_seller_idx" ON "thrift_transactions" ("seller_user_id");

CREATE TABLE IF NOT EXISTS "thrift_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "transaction_id" uuid NOT NULL REFERENCES "thrift_transactions"("id") ON DELETE CASCADE,
  "listing_id" uuid NOT NULL,
  "seller_user_id" uuid NOT NULL,
  "buyer_user_id" uuid NOT NULL,
  "source_cloth_id" uuid NOT NULL,
  "new_cloth_id" uuid NOT NULL,
  "image_url" text NOT NULL,
  "transferred_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "thrift_transfers_tx_idx" ON "thrift_transfers" ("transaction_id");
