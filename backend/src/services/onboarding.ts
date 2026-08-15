// Per-user state for the guided tour. Kept server-side so the tour doesn't
// restart when someone switches device or clears storage, and so existing
// users can be excluded deterministically.
import { neon } from "@neondatabase/serverless";

/**
 * Accounts created before the tour existed are never offered it — they've
 * already found their way around. Set to the date this shipped.
 */
const LAUNCHED_AT = "2026-08-15T00:00:00Z";

export type OnboardingStatus = "not_started" | "offered" | "active" | "completed" | "skipped";

export type OnboardingState = {
  status: OnboardingStatus;
  currentStep: string | null;
  seenWardrobeHint: boolean;
  seenTryonHint: boolean;
  seenPlanHint: boolean;
  seenChatHint: boolean;
};

function sql() {
  return neon(process.env.DATABASE_URL!);
}

let ready: Promise<void> | null = null;

export function ensureOnboardingSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const q = sql();
    await q`DO $$ BEGIN
      CREATE TYPE "onboarding_status" AS ENUM('not_started','offered','active','completed','skipped');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`CREATE TABLE IF NOT EXISTS "onboarding_state" (
      "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
      "status" "onboarding_status" NOT NULL DEFAULT 'not_started',
      "current_step" text,
      "offered_at" timestamptz,
      "started_at" timestamptz,
      "completed_at" timestamptz,
      "skipped_at" timestamptz,
      "seen_wardrobe_hint" boolean NOT NULL DEFAULT false,
      "seen_tryon_hint" boolean NOT NULL DEFAULT false,
      "seen_plan_hint" boolean NOT NULL DEFAULT false,
      "seen_chat_hint" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`;
  })();
  return ready;
}

/**
 * Reads the state, creating it on first touch. An account that predates the
 * tour is recorded as 'skipped' so it is never prompted, while still being
 * able to replay deliberately from Settings.
 */
export async function getOnboarding(userId: string): Promise<OnboardingState> {
  await ensureOnboardingSchema();
  const q = sql();
  await q`
    INSERT INTO onboarding_state (user_id, status)
    SELECT ${userId},
           CASE WHEN u.created_at < ${LAUNCHED_AT}::timestamptz
                THEN 'skipped'::onboarding_status
                ELSE 'not_started'::onboarding_status END
      FROM users u WHERE u.id = ${userId}
    ON CONFLICT (user_id) DO NOTHING`;

  const rows = (await q`
    SELECT status, current_step, seen_wardrobe_hint, seen_tryon_hint,
           seen_plan_hint, seen_chat_hint
      FROM onboarding_state WHERE user_id = ${userId} LIMIT 1`) as any[];
  const r = rows[0] ?? {};
  return {
    status: r.status ?? "not_started",
    currentStep: r.current_step ?? null,
    seenWardrobeHint: Boolean(r.seen_wardrobe_hint),
    seenTryonHint: Boolean(r.seen_tryon_hint),
    seenPlanHint: Boolean(r.seen_plan_hint),
    seenChatHint: Boolean(r.seen_chat_hint),
  };
}

export async function updateOnboarding(
  userId: string,
  patch: { status?: OnboardingStatus; currentStep?: string | null; hint?: string },
): Promise<OnboardingState> {
  await ensureOnboardingSchema();
  await getOnboarding(userId); // guarantees the row exists
  const q = sql();

  if (patch.status) {
    // Timestamps are set on the transition that earns them, and never cleared
    // by a later replay — the history of what happened stays intact.
    await q`
      UPDATE onboarding_state
         SET status = ${patch.status}::onboarding_status,
             offered_at   = CASE WHEN ${patch.status} = 'offered'   THEN COALESCE(offered_at, now())   ELSE offered_at END,
             started_at   = CASE WHEN ${patch.status} = 'active'    THEN now()                          ELSE started_at END,
             completed_at = CASE WHEN ${patch.status} = 'completed' THEN now()                          ELSE completed_at END,
             skipped_at   = CASE WHEN ${patch.status} = 'skipped'   THEN now()                          ELSE skipped_at END,
             updated_at = now()
       WHERE user_id = ${userId}`;
  }
  if (patch.currentStep !== undefined) {
    await q`UPDATE onboarding_state SET current_step = ${patch.currentStep}, updated_at = now()
             WHERE user_id = ${userId}`;
  }
  if (patch.hint) {
    const col = {
      wardrobe: "seen_wardrobe_hint",
      tryon: "seen_tryon_hint",
      plan: "seen_plan_hint",
      chat: "seen_chat_hint",
    }[patch.hint];
    if (col === "seen_wardrobe_hint") await q`UPDATE onboarding_state SET seen_wardrobe_hint=true, updated_at=now() WHERE user_id=${userId}`;
    if (col === "seen_tryon_hint") await q`UPDATE onboarding_state SET seen_tryon_hint=true, updated_at=now() WHERE user_id=${userId}`;
    if (col === "seen_plan_hint") await q`UPDATE onboarding_state SET seen_plan_hint=true, updated_at=now() WHERE user_id=${userId}`;
    if (col === "seen_chat_hint") await q`UPDATE onboarding_state SET seen_chat_hint=true, updated_at=now() WHERE user_id=${userId}`;
  }
  return getOnboarding(userId);
}
