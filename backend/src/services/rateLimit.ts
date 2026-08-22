import type { Request } from "express";
import { neon } from "@neondatabase/serverless";

function sql() {
  return neon(process.env.DATABASE_URL!);
}

/**
 * A fixed-window counter shared by every instance.
 *
 * The in-memory version this replaces counted per process, which on serverless
 * means per instance — six requests in a row were spread across enough of them
 * that a limit of five never triggered in production. Anything meant to stop
 * abuse has to count somewhere all the instances can see, so it counts here.
 *
 * One statement: the insert either creates the window or bumps it, and returns
 * the running total, so two requests arriving together cannot both read a
 * stale count and both decide they are under the ceiling.
 */
let ready: Promise<void> | null = null;

export function ensureRateLimitSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS "rate_limits" (
      "bucket" text NOT NULL,
      "window_start" bigint NOT NULL,
      "count" integer NOT NULL DEFAULT 0,
      PRIMARY KEY ("bucket", "window_start")
    )`;
    // Old windows are dead weight; this lets a sweep find them cheaply.
    await q`CREATE INDEX IF NOT EXISTS "rate_limits_window_idx" ON "rate_limits" ("window_start")`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export async function overRateLimit(
  bucket: string,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  try {
    await ensureRateLimitSchema();
    const q = sql();
    const windowStart = Math.floor(Date.now() / windowMs);
    const rows = (await q`
      INSERT INTO rate_limits (bucket, window_start, count)
      VALUES (${`${bucket}:${key}`}, ${windowStart}, 1)
      ON CONFLICT (bucket, window_start)
      DO UPDATE SET count = rate_limits.count + 1
      RETURNING count`) as Array<{ count: number }>;

    // Housekeeping, rarely, so old windows do not accumulate forever.
    if (Math.random() < 0.01) {
      const cutoff = windowStart - Math.ceil((24 * 60 * 60 * 1000) / windowMs);
      await q`DELETE FROM rate_limits WHERE window_start < ${cutoff}`;
    }
    return Number(rows[0]?.count ?? 0) > max;
  } catch (err) {
    // A limiter that breaks must not take sign-in down with it. Log and allow:
    // the failure mode of "not counting" is far better than "nobody can log in".
    console.error("[rateLimit] counter unavailable, allowing request:", err);
    return false;
  }
}

/**
 * The caller's address, as far as it can be trusted.
 *
 * Express is deliberately not trusting proxies wholesale — that would let a
 * caller name their own address through x-forwarded-for and mint a fresh
 * bucket at will. Vercel sets headers a client cannot forge, so those come
 * first, and the left-most forwarded entry is the last resort.
 */
export function clientIp(req: Request): string {
  const vercel = req.headers["x-vercel-forwarded-for"];
  if (typeof vercel === "string" && vercel.trim()) return vercel.split(",")[0]!.trim();

  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();

  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0]!.trim();

  return req.socket?.remoteAddress ?? "unknown";
}

/** Only for tests: clear every counted window. */
export async function resetRateLimits() {
  await ensureRateLimitSchema();
  await sql()`DELETE FROM rate_limits`;
}
