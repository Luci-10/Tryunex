// The credit engine.
//
// Two constraints shape everything here:
//
// 1. Neon's HTTP driver has no interactive transactions, so anything that
//    must be atomic is expressed as ONE statement. Each such statement takes
//    a per-user advisory lock in its first CTE so concurrent requests
//    serialise and the last credit can't be spent twice.
// 2. The ledger is append-only. A balance is always SUM over unexpired rows,
//    never a mutable column, so a bug can't silently desynchronise a total
//    from its history.
import { neon } from "@neondatabase/serverless";
import { monthPeriod, monthKey } from "./period.js";

function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  return neon(process.env.DATABASE_URL);
}

let ready: Promise<void> | null = null;

/**
 * Idempotent DDL on first use. The repo's drizzle migration history has never
 * matched the live schema (see backend/drizzle/0001), so try-on already
 * establishes this pattern and billing follows it rather than depending on a
 * migration run that may never happen.
 */
export function ensureBillingSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const q = sql();
    await q`DO $$ BEGIN CREATE TYPE "billing_tier" AS ENUM('free','lite','plus','style'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN CREATE TYPE "subscription_status" AS ENUM('none','pending','active','past_due','cancelled','expired'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN CREATE TYPE "credit_ledger_type" AS ENUM('free_monthly_grant','pack_purchase_grant','subscription_grant','tryon_debit','regenerate_debit','generation_refund','admin_adjustment','expiry'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN CREATE TYPE "credit_source" AS ENUM('free','pack','subscription','tryon','regenerate','refund'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN CREATE TYPE "payment_kind" AS ENUM('pack','subscription'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await q`DO $$ BEGIN CREATE TYPE "payment_status" AS ENUM('created','pending','paid','failed','refunded','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$`;

    await q`CREATE TABLE IF NOT EXISTS "billing_profiles" (
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
    )`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "billing_profiles_user_idx" ON "billing_profiles" ("user_id")`;
    // Held while a generation is in flight; see claimGenerationSlot.
    await q`ALTER TABLE "billing_profiles" ADD COLUMN IF NOT EXISTS "active_generation_at" timestamptz`;

    await q`CREATE TABLE IF NOT EXISTS "credit_ledger" (
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
    )`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_idem_idx" ON "credit_ledger" ("idempotency_key")`;
    await q`CREATE INDEX IF NOT EXISTS "credit_ledger_user_idx" ON "credit_ledger" ("user_id")`;
    await q`CREATE INDEX IF NOT EXISTS "credit_ledger_expiry_idx" ON "credit_ledger" ("user_id","expires_at")`;
    await q`CREATE INDEX IF NOT EXISTS "credit_ledger_created_idx" ON "credit_ledger" ("user_id","created_at" DESC)`;

    await q`CREATE TABLE IF NOT EXISTS "payments" (
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
    )`;
    // Every delivered webhook id is recorded, so a Razorpay retry is a
    // no-op even before the per-grant idempotency keys are consulted.
    await q`CREATE TABLE IF NOT EXISTS "webhook_events" (
      "event_id" text PRIMARY KEY,
      "event_type" text,
      "received_at" timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS "payments_user_idx" ON "payments" ("user_id")`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "payments_order_idx" ON "payments" ("razorpay_order_id") WHERE "razorpay_order_id" IS NOT NULL`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS "payments_event_idx" ON "payments" ("webhook_event_id") WHERE "webhook_event_id" IS NOT NULL`;
  })();
  return ready;
}

export type Balance = {
  total: number;
  free: number;
  subscription: number;
  pack: number;
  /** Soonest expiry among unexpired credits, if any. */
  nextExpiry: string | null;
};

export type BillingProfile = {
  currentTier: "free" | "lite" | "plus" | "style";
  subscriptionStatus: string;
  subscriptionStartedAt: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  freeChatUsed: number;
  freeChatPeriodEnd: string | null;
};

/** Creates the profile on first touch and rolls the monthly periods over. */
export async function ensureProfile(userId: string): Promise<BillingProfile> {
  await ensureBillingSchema();
  const q = sql();
  const { start, end } = monthPeriod();

  await q`
    INSERT INTO billing_profiles (user_id, free_allowance_period_start, free_allowance_period_end,
                                  free_chat_period_start, free_chat_period_end)
    VALUES (${userId}, ${start.toISOString()}, ${end.toISOString()},
            ${start.toISOString()}, ${end.toISOString()})
    ON CONFLICT (user_id) DO NOTHING`;

  // A new month resets the chat counter and moves both period windows.
  await q`
    UPDATE billing_profiles
       SET free_chat_used = 0,
           free_chat_period_start = ${start.toISOString()},
           free_chat_period_end = ${end.toISOString()},
           free_allowance_period_start = ${start.toISOString()},
           free_allowance_period_end = ${end.toISOString()},
           updated_at = now()
     WHERE user_id = ${userId}
       AND (free_chat_period_end IS NULL OR free_chat_period_end <= now())`;

  const rows = (await q`
    SELECT current_tier, subscription_status, subscription_started_at,
           subscription_current_period_end, free_chat_used, free_chat_period_end
      FROM billing_profiles WHERE user_id = ${userId} LIMIT 1`) as any[];
  const r = rows[0];
  return {
    currentTier: r.current_tier,
    subscriptionStatus: r.subscription_status,
    subscriptionStartedAt: r.subscription_started_at,
    subscriptionCurrentPeriodEnd: r.subscription_current_period_end,
    freeChatUsed: Number(r.free_chat_used ?? 0),
    freeChatPeriodEnd: r.free_chat_period_end,
  };
}

/** Credits a brand-new account receives the first time it is touched. */
export const WELCOME_CREDITS = 3;
/** Credits every account receives each month after that. */
export const MONTHLY_FREE_CREDITS = 1;
/** How long the welcome credits last. */
const WELCOME_WINDOW_DAYS = 30;

/**
 * Grants the free allowance, at most once per user per month.
 *
 * A new account gets WELCOME_CREDITS with a 30-day window rather than a
 * calendar-month one — signing up on the 30th should not mean the welcome
 * credits vanish the next day. Every month after that grants
 * MONTHLY_FREE_CREDITS, expiring with the month as before.
 *
 * The amount and the expiry are decided inside one statement, so the "is this
 * their first?" check can't race with a concurrent request, and the monthly
 * idempotency key still makes a repeat call a no-op.
 */
export async function grantFreeMonthlyCredit(userId: string): Promise<void> {
  await ensureBillingSchema();
  const q = sql();
  const { end } = monthPeriod();
  const welcomeEnd = new Date(Date.now() + WELCOME_WINDOW_DAYS * 86_400_000);
  await q`
    INSERT INTO credit_ledger (user_id, type, credit_amount, source_type, expires_at, idempotency_key)
    SELECT ${userId}::uuid,
           'free_monthly_grant'::credit_ledger_type,
           CASE WHEN first.seen THEN ${MONTHLY_FREE_CREDITS}::int ELSE ${WELCOME_CREDITS}::int END,
           'free'::credit_source,
           CASE WHEN first.seen THEN ${end.toISOString()}::timestamptz
                ELSE ${welcomeEnd.toISOString()}::timestamptz END,
           ${`free:${userId}:${monthKey()}`}
      FROM (
        SELECT EXISTS (
          SELECT 1 FROM credit_ledger
           WHERE user_id = ${userId} AND type = 'free_monthly_grant'
        ) AS seen
      ) AS first
    ON CONFLICT (idempotency_key) DO NOTHING`;
}

export async function getBalance(userId: string): Promise<Balance> {
  await ensureBillingSchema();
  const q = sql();
  // Grants carry a source; debits are negative and are apportioned against
  // the total rather than a specific bucket, so buckets are computed as
  // "grants of that source, less what has already been spent from it" in
  // priority order below.
  const rows = (await q`
    SELECT source_type, expires_at, SUM(credit_amount)::int AS amount
      FROM credit_ledger
     WHERE user_id = ${userId}
       AND (expires_at IS NULL OR expires_at > now())
     GROUP BY source_type, expires_at`) as any[];

  let total = 0;
  const buckets: Record<string, number> = { free: 0, subscription: 0, pack: 0 };
  let nextExpiry: string | null = null;
  for (const r of rows) {
    const amt = Number(r.amount);
    total += amt;
    if (r.source_type in buckets) buckets[r.source_type] += amt;
    else buckets.pack += 0; // debits/refunds don't belong to a grant bucket
    if (amt > 0 && r.expires_at && (!nextExpiry || r.expires_at < nextExpiry)) {
      nextExpiry = r.expires_at;
    }
  }

  // Spending is applied against the buckets in the documented priority order
  // so the displayed breakdown matches what will actually be used next.
  const spent = Math.max(0, buckets.free + buckets.subscription + buckets.pack - total);
  let remaining = spent;
  for (const key of ["free", "subscription", "pack"] as const) {
    const take = Math.min(buckets[key], remaining);
    buckets[key] -= take;
    remaining -= take;
  }

  return {
    total: Math.max(0, total),
    free: Math.max(0, buckets.free),
    subscription: Math.max(0, buckets.subscription),
    pack: Math.max(0, buckets.pack),
    nextExpiry,
  };
}

export type DebitResult =
  | { ok: true; ledgerId: string; remaining: number }
  | { ok: false; reason: "insufficient"; remaining: number }
  | { ok: true; ledgerId: null; remaining: number; alreadyApplied: true };

/**
 * Spends exactly one credit, atomically.
 *
 * One statement, so it is one transaction. The advisory lock in the first CTE
 * serialises concurrent generations for the same user, which is what stops
 * two parallel requests both seeing "1 available" and both spending it.
 * `idempotencyKey` makes a retried request a no-op rather than a second
 * charge.
 */
/**
 * How many credits a look costs. Deliberately coarse so it is easy to explain:
 * a normal outfit is one credit, a big layered look is two.
 */
export const MAX_LOOK_ITEMS = 5;

export function creditsForItems(itemCount: number): number {
  return itemCount >= 4 ? 2 : 1;
}

/** Back-compat wrapper — a single-credit debit. */
export async function debitOneCredit(
  userId: string,
  kind: "tryon_debit" | "regenerate_debit",
  idempotencyKey: string,
): Promise<DebitResult> {
  return debitCredits(userId, kind, idempotencyKey, 1);
}

/**
 * Takes `amount` credits in one statement.
 *
 * The advisory lock in the first CTE serialises debits per user, so two
 * concurrent requests cannot both read the same balance and both succeed. The
 * idempotency key makes a repeated click, retry or refresh a no-op rather than
 * a second charge.
 */
export async function debitCredits(
  userId: string,
  kind: "tryon_debit" | "regenerate_debit",
  idempotencyKey: string,
  amount: number,
): Promise<DebitResult> {
  await ensureBillingSchema();
  const q = sql();
  const source = kind === "regenerate_debit" ? "regenerate" : "tryon";
  const cost = Math.max(1, Math.round(amount));

  const rows = (await q`
    WITH lk AS (
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 42)) AS locked
    ),
    existing AS (
      SELECT id FROM credit_ledger, lk WHERE idempotency_key = ${idempotencyKey} LIMIT 1
    ),
    bal AS (
      SELECT COALESCE(SUM(credit_amount), 0)::int AS available
        FROM credit_ledger, lk
       WHERE user_id = ${userId}
         AND (expires_at IS NULL OR expires_at > now())
    ),
    ins AS (
      INSERT INTO credit_ledger (user_id, type, credit_amount, source_type, idempotency_key)
      SELECT ${userId}, ${kind}::credit_ledger_type, ${-cost}::int, ${source}::credit_source, ${idempotencyKey}
        FROM bal
       WHERE bal.available >= ${cost}::int
         AND NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    )
    SELECT (SELECT available FROM bal) AS available,
           (SELECT id FROM ins) AS ledger_id,
           (SELECT id FROM existing) AS existing_id`) as any[];

  const row = rows[0];
  const available = Number(row?.available ?? 0);
  if (row?.existing_id) {
    return { ok: true, ledgerId: null, remaining: available, alreadyApplied: true };
  }
  if (!row?.ledger_id) return { ok: false, reason: "insufficient", remaining: available };
  return { ok: true, ledgerId: row.ledger_id, remaining: Math.max(0, available - cost) };
}

/**
 * Puts a credit back after a generation that never produced a usable image.
 * Keyed off the debit, so a retry of the same failure refunds once only.
 */
export async function refundCredit(userId: string, debitIdempotencyKey: string): Promise<void> {
  await ensureBillingSchema();
  const q = sql();
  await q`
    INSERT INTO credit_ledger (user_id, type, credit_amount, source_type, idempotency_key)
    SELECT ${userId}, 'generation_refund',
           (SELECT ABS(credit_amount) FROM credit_ledger
             WHERE idempotency_key = ${debitIdempotencyKey} AND user_id = ${userId} LIMIT 1),
           'refund', ${`refund:${debitIdempotencyKey}`}
     WHERE EXISTS (
       SELECT 1 FROM credit_ledger
        WHERE idempotency_key = ${debitIdempotencyKey} AND user_id = ${userId}
     )
    ON CONFLICT (idempotency_key) DO NOTHING`;
}

/** Grants purchased or subscription credits. Idempotent on the key. */
export async function grantCredits(opts: {
  userId: string;
  amount: number;
  type: "pack_purchase_grant" | "subscription_grant" | "admin_adjustment";
  source: "pack" | "subscription";
  productCode: string;
  expiresAt: Date | null;
  idempotencyKey: string;
  paymentId?: string | null;
}): Promise<boolean> {
  await ensureBillingSchema();
  const q = sql();
  const rows = (await q`
    INSERT INTO credit_ledger (user_id, type, credit_amount, source_type, product_code,
                               related_payment_id, expires_at, idempotency_key)
    VALUES (${opts.userId}, ${opts.type}::credit_ledger_type, ${opts.amount},
            ${opts.source}::credit_source, ${opts.productCode},
            ${opts.paymentId ?? null}, ${opts.expiresAt ? opts.expiresAt.toISOString() : null},
            ${opts.idempotencyKey})
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id`) as any[];
  return rows.length > 0;
}

/** Human-readable ledger for the Plans page. No provider ids, no internals. */
export async function recentActivity(userId: string, limit = 20) {
  await ensureBillingSchema();
  const q = sql();
  const rows = (await q`
    SELECT type, credit_amount, product_code, created_at, expires_at
      FROM credit_ledger
     WHERE user_id = ${userId}
     ORDER BY created_at DESC
     LIMIT ${limit}`) as any[];

  const LABEL: Record<string, string> = {
    free_monthly_grant: "Free monthly credit added",
    pack_purchase_grant: "Credit pack added",
    subscription_grant: "Monthly plan credits added",
    tryon_debit: "Generated a Try-on look",
    regenerate_debit: "Regenerated a new variation",
    generation_refund: "Credit restored after a failed generation",
    admin_adjustment: "Adjustment",
    expiry: "Credits expired",
  };
  return rows.map((r) => ({
    label: LABEL[r.type] ?? "Credit activity",
    amount: Number(r.credit_amount),
    at: r.created_at,
  }));
}

/* ------------------------------------------------------------ chat quota */

export const FREE_CHAT_LIMIT = 10;

export type ChatQuota = { limited: boolean; used: number; limit: number; resetsAt: string | null };

export async function getChatQuota(userId: string): Promise<ChatQuota> {
  const profile = await ensureProfile(userId);
  const limited = profile.currentTier === "free";
  return {
    limited,
    used: profile.freeChatUsed,
    limit: FREE_CHAT_LIMIT,
    resetsAt: profile.freeChatPeriodEnd,
  };
}

/**
 * Counts one chat, but only if the user is on the free tier and under the
 * cap. Returns false when the cap is already reached, so the caller can
 * refuse before spending anything on the model.
 */
export async function consumeChat(userId: string): Promise<{ allowed: boolean; quota: ChatQuota }> {
  const profile = await ensureProfile(userId);
  if (profile.currentTier !== "free") {
    return { allowed: true, quota: { limited: false, used: 0, limit: FREE_CHAT_LIMIT, resetsAt: null } };
  }
  const q = sql();
  const rows = (await q`
    UPDATE billing_profiles
       SET free_chat_used = free_chat_used + 1, updated_at = now()
     WHERE user_id = ${userId}
       AND free_chat_used < ${FREE_CHAT_LIMIT}
    RETURNING free_chat_used, free_chat_period_end`) as any[];

  if (rows.length === 0) {
    return {
      allowed: false,
      quota: {
        limited: true,
        used: FREE_CHAT_LIMIT,
        limit: FREE_CHAT_LIMIT,
        resetsAt: profile.freeChatPeriodEnd,
      },
    };
  }
  return {
    allowed: true,
    quota: {
      limited: true,
      used: Number(rows[0].free_chat_used),
      limit: FREE_CHAT_LIMIT,
      resetsAt: rows[0].free_chat_period_end,
    },
  };
}

/** Undoes a chat count when the model never produced a response. */
export async function releaseChat(userId: string): Promise<void> {
  const q = sql();
  await q`
    UPDATE billing_profiles
       SET free_chat_used = GREATEST(0, free_chat_used - 1), updated_at = now()
     WHERE user_id = ${userId}`;
}


/* -------------------------------------------------- generation throttles */

/** Generations older than this are treated as abandoned, not in-flight. */
const GENERATION_LEASE_MS = 3 * 60 * 1000;

/** Fresh generations allowed per user per rolling hour. */
export const GENERATION_RATE_LIMIT = 20;

/**
 * Claims the user's single generation slot. One conditional UPDATE, so two
 * simultaneous requests cannot both win. A stale lease (crashed request,
 * killed function) is reclaimed rather than blocking the user forever.
 */
export async function claimGenerationSlot(userId: string): Promise<boolean> {
  await ensureBillingSchema();
  const q = sql();
  const cutoff = new Date(Date.now() - GENERATION_LEASE_MS).toISOString();
  const rows = (await q`
    UPDATE billing_profiles
       SET active_generation_at = now(), updated_at = now()
     WHERE user_id = ${userId}
       AND (active_generation_at IS NULL OR active_generation_at < ${cutoff})
    RETURNING id`) as any[];
  return rows.length > 0;
}

export async function releaseGenerationSlot(userId: string): Promise<void> {
  try {
    const q = sql();
    await q`UPDATE billing_profiles SET active_generation_at = NULL WHERE user_id = ${userId}`;
  } catch {
    // The lease expires on its own; a failed release is not worth an error.
  }
}

/** Fresh generations in the last hour, read from the ledger's debit rows. */
export async function recentGenerationCount(userId: string): Promise<number> {
  await ensureBillingSchema();
  const q = sql();
  const rows = (await q`
    SELECT count(*)::int AS n FROM credit_ledger
     WHERE user_id = ${userId}
       AND type IN ('tryon_debit','regenerate_debit')
       AND created_at > now() - interval '1 hour'`) as any[];
  return Number(rows[0]?.n ?? 0);
}

/** Emergency stop, flipped with an env var and no redeploy of code paths. */
export function generationDisabled(): boolean {
  return process.env.TRYON_GENERATION_DISABLED === "1";
}


/**
 * Records a webhook delivery. Returns false when this event id has already
 * been handled, which is Razorpay retrying rather than a new event.
 */
export async function claimWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
  if (!eventId) return true; // nothing to dedupe on; grant-level keys still guard
  await ensureBillingSchema();
  const q = sql();
  const rows = (await q`
    INSERT INTO webhook_events (event_id, event_type) VALUES (${eventId}, ${eventType})
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id`) as any[];
  return rows.length > 0;
}

export type ActivePack = {
  code: string;
  purchasedAt: string;
  expiresAt: string | null;
};

/**
 * The pack a user is currently spending, or null.
 *
 * "Currently spending" is decided by getBalance's pack bucket, not by this
 * query: spending is applied free → subscription → pack, so pack credits are
 * the last to go and a positive bucket means the purchase is genuinely still
 * in use. This only answers *which* pack, by taking the most recent unexpired
 * purchase — the one those remaining credits belong to.
 */
export async function getActivePack(userId: string): Promise<ActivePack | null> {
  await ensureBillingSchema();
  const q = sql();
  const rows = (await q`
    SELECT product_code, created_at, expires_at
      FROM credit_ledger
     WHERE user_id = ${userId}
       AND type = 'pack_purchase_grant'
       AND product_code IS NOT NULL
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC
     LIMIT 1`) as any[];
  const row = rows[0];
  if (!row) return null;
  return {
    code: String(row.product_code),
    purchasedAt: row.created_at,
    expiresAt: row.expires_at ?? null,
  };
}
