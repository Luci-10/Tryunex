// Who has accepted the current Terms and Privacy Policy.
//
// Versioned deliberately: acceptance is recorded against a specific version,
// so publishing a materially changed policy is a matter of bumping the version
// and everyone is asked once more. Old acceptances are kept as the record of
// what was agreed and when.
import { neon } from "@neondatabase/serverless";

function sql() {
  return neon(process.env.DATABASE_URL!);
}

/**
 * Bump this only for a material change. Every signed-in user is asked to
 * accept again the next time they load the app, so a needless bump is a
 * needless interruption for everyone.
 */
export const POLICY_VERSION = "2026-08-16";

let ready: Promise<void> | null = null;

export function ensurePolicySchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS "policy_acceptances" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "version" text NOT NULL,
      "accepted_at" timestamptz NOT NULL DEFAULT now()
    )`;
    // One row per user per version — a double submit records one acceptance.
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "policy_acceptances_user_version_idx"
      ON "policy_acceptances" ("user_id", "version")`;
    await q`CREATE INDEX IF NOT EXISTS "policy_acceptances_user_idx"
      ON "policy_acceptances" ("user_id")`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export type PolicyStatus = {
  version: string;
  accepted: boolean;
  acceptedAt: string | null;
};

export async function getPolicyStatus(userId: string): Promise<PolicyStatus> {
  await ensurePolicySchema();
  const q = sql();
  const rows = (await q`
    SELECT accepted_at FROM policy_acceptances
     WHERE user_id = ${userId} AND version = ${POLICY_VERSION}
     LIMIT 1`) as Array<{ accepted_at: string }>;
  return {
    version: POLICY_VERSION,
    accepted: rows.length > 0,
    acceptedAt: rows[0]?.accepted_at ?? null,
  };
}

/** Idempotent: accepting twice is one record, and keeps the first timestamp. */
export async function acceptPolicy(userId: string): Promise<PolicyStatus> {
  await ensurePolicySchema();
  const q = sql();
  await q`
    INSERT INTO policy_acceptances (user_id, version)
    VALUES (${userId}, ${POLICY_VERSION})
    ON CONFLICT (user_id, version) DO NOTHING`;
  return getPolicyStatus(userId);
}
