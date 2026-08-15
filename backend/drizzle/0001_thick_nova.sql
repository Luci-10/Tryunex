-- Adds the primary style/formality tag to clothes.
--
-- Hand-trimmed on purpose. `drizzle-kit generate` produced a full catch-up
-- against a stale meta snapshot: it wanted to recreate tryon_assets, re-add
-- allow_tryon/settled, and retype live uuid columns. Those already exist in
-- every deployed database (sharing and try-on work today), so replaying them
-- would fail. Only the genuinely new column is applied here, idempotently,
-- so a re-run or a partially-migrated database is safe.

DO $$ BEGIN
 CREATE TYPE "public"."style_tag" AS ENUM('casual', 'smart_casual', 'formal', 'party', 'sports', 'lounge', 'traditional', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "clothes" ADD COLUMN IF NOT EXISTS "style_tag" "style_tag" DEFAULT 'casual' NOT NULL;
