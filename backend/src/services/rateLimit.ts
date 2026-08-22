import type { Request } from "express";

/**
 * A small fixed-window counter, kept in memory.
 *
 * On serverless this is per-instance, so it is a speed bump rather than a
 * guarantee: a determined attacker spread across enough cold starts gets more
 * than the stated ceiling. It still removes the cheap version of the attack,
 * which is one script hammering one endpoint, and that is what the abuse it
 * guards against actually looks like.
 */
type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Map<string, Entry>>();

export function overRateLimit(bucket: string, key: string, max: number, windowMs: number): boolean {
  let map = buckets.get(bucket);
  if (!map) {
    map = new Map();
    buckets.set(bucket, map);
  }
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  // Opportunistic cleanup so a long-lived instance cannot grow without bound.
  if (map.size > 5000) {
    for (const [k, v] of map) if (now > v.resetAt) map.delete(k);
  }
  return entry.count > max;
}

/**
 * The caller's address, as far as it can be trusted.
 *
 * Express is not configured to trust proxies, and deliberately so: turning
 * that on wholesale would let a caller name their own address through
 * x-forwarded-for and sidestep any per-address limit. Vercel sets its own
 * headers that a client cannot forge, so those are preferred, and the
 * left-most forwarded entry is the last resort rather than the first choice.
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

/** Only for tests: forget everything counted so far. */
export function resetRateLimits() {
  buckets.clear();
}
