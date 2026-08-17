-- 0004_policy_acceptances.sql — records who accepted which policy version.
-- Mirrors ensurePolicySchema() in src/services/policy.ts, which applies the
-- same statements at runtime. Every statement is idempotent.

CREATE TABLE IF NOT EXISTS "policy_acceptances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "version" text NOT NULL,
  "accepted_at" timestamptz NOT NULL DEFAULT now()
);

-- One row per user per version: a repeated submit records a single acceptance
-- and preserves the original timestamp.
CREATE UNIQUE INDEX IF NOT EXISTS "policy_acceptances_user_version_idx"
  ON "policy_acceptances" ("user_id", "version");

CREATE INDEX IF NOT EXISTS "policy_acceptances_user_idx"
  ON "policy_acceptances" ("user_id");
