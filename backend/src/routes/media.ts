// Access-controlled reads for private user images.
//
// This is the replacement for permanent public image URLs. Nothing here trusts
// a caller-supplied object key: the caller names a *record* (a cloth, a selfie,
// a try-on result, a listing), the server resolves that record, checks the
// caller is allowed to see it, and only then mints a short-lived signed URL for
// whatever key that record actually holds.
//
// Handing out signed URLs by key instead would let anyone read any object by
// guessing or replaying a key, which is the hole this closes.
import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  clothes,
  shares,
  tryonAssets,
  thriftListings,
  thriftBlocks,
} from "../db/schema.js";
import { requireAuth } from "../services/auth.js";
import { presignGet, keyFromUrl, SIGNED_GET_TTL_SECONDS } from "../services/r2.js";
import { ensureThriftSchema } from "../services/thrift.js";
import { metric } from "../services/metrics.js";

const router = Router();
router.use(requireAuth);

/**
 * Per-user ceiling on URL minting. A wardrobe page asks for many at once, so
 * the limit is generous — it exists to stop a script enumerating, not to
 * constrain normal use. In-memory, so it is per-instance; on serverless that
 * makes it a speed bump rather than a guarantee, which is the honest framing.
 */
const RATE_LIMIT = 600;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function overRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = hits.get(userId);
  if (!entry || now > entry.resetAt) {
    hits.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  // Opportunistic cleanup so the map cannot grow without bound.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  }
  return entry.count > RATE_LIMIT;
}

type Resolved = { url: string } | { error: 403 | 404 };

/** A cloth is readable by its owner, by a friend it is shared with, or if it
 *  is actively listed on the marketplace. Same rules the try-on path uses. */
async function resolveCloth(id: string, me: string): Promise<Resolved> {
  const [row] = await db.select().from(clothes).where(eq(clothes.id, id)).limit(1);
  if (!row) return { error: 404 };
  if (row.userId === me) return { url: row.imageUrl };

  const [share] = await db
    .select({ id: shares.id })
    .from(shares)
    .where(and(eq(shares.ownerId, row.userId), eq(shares.viewerId, me)))
    .limit(1);
  if (share) return { url: row.imageUrl };

  await ensureThriftSchema();
  const [listed] = await db
    .select({ id: thriftListings.id })
    .from(thriftListings)
    .where(
      and(
        eq(thriftListings.sourceClothId, row.id),
        eq(thriftListings.sellerUserId, row.userId),
        eq(thriftListings.status, "active"),
      ),
    )
    .limit(1);
  if (listed) return { url: row.imageUrl };

  return { error: 403 };
}

/** Selfies and generated results belong to exactly one person. */
async function resolveTryonAsset(
  id: string,
  me: string,
  type: "selfie" | "result",
): Promise<Resolved> {
  const [row] = await db
    .select()
    .from(tryonAssets)
    .where(and(eq(tryonAssets.id, id), eq(tryonAssets.type, type)))
    .limit(1);
  if (!row) return { error: 404 };
  // No sharing, no marketplace exception: a photo of someone's body and the
  // results generated from it are readable only by that account.
  if (row.userId !== me) return { error: 403 };
  return { url: row.imageUrl };
}

/** A listing image is visible to the marketplace while the listing is live. */
async function resolveListing(id: string, me: string): Promise<Resolved> {
  await ensureThriftSchema();
  const [row] = await db.select().from(thriftListings).where(eq(thriftListings.id, id)).limit(1);
  if (!row) return { error: 404 };
  if (row.sellerUserId === me) return { url: row.imageUrl };
  if (row.status !== "active") return { error: 404 };

  const blocked = await db
    .select({ id: thriftBlocks.id })
    .from(thriftBlocks)
    .where(
      or(
        and(
          eq(thriftBlocks.blockerUserId, me),
          eq(thriftBlocks.blockedUserId, row.sellerUserId),
        ),
        and(
          eq(thriftBlocks.blockerUserId, row.sellerUserId),
          eq(thriftBlocks.blockedUserId, me),
        ),
      ),
    )
    .limit(1);
  if (blocked.length > 0) return { error: 404 };

  return { url: row.imageUrl };
}

const SCOPES = ["cloth", "selfie", "tryon", "listing"] as const;

// GET /api/media/proxy/:scope/:id
// Proxies the image data from R2. This is the most reliable way to show
// protected images in the Capacitor app, as it avoids CORS issues with
// signed R2 URLs in the WebView and ensures session cookies are handled
// correctly by the API.
router.get("/proxy/:scope/:id", async (req, res) => {
  const parse = z
    .object({ scope: z.enum(SCOPES), id: z.string().uuid() })
    .safeParse(req.params);
  if (!parse.success) return res.status(400).json({ error: "Bad request" });

  const me = req.userId!;
  // Same ceiling as the signed-URL route. This one matters more: it streams
  // the image through the function instead of handing back a URL, so an
  // unmetered loop here is bandwidth as well as CPU.
  if (overRateLimit(me)) {
    metric("media_rate_limited", { userId: me });
    return res.status(429).json({ error: "Too many image requests. Try again shortly." });
  }
  const { scope, id } = parse.data;
  const resolved =
    scope === "cloth"
      ? await resolveCloth(id, me)
      : scope === "selfie"
        ? await resolveTryonAsset(id, me, "selfie")
        : scope === "tryon"
          ? await resolveTryonAsset(id, me, "result")
          : await resolveListing(id, me);

  if ("error" in resolved) {
    return res.status(resolved.error).json({ error: "Not found", scope, id });
  }

  try {
    const key = keyFromUrl(resolved.url);
    if (!key) {
      // The record id is safe to log; the URL is not.
      console.error(`[media/proxy] unrecognised storage reference on ${scope} ${id}`);
      throw new Error("Unrecognised storage reference");
    }
    const signedUrl = presignGet(key);

    const got = await fetch(signedUrl);
    if (!got.ok) {
      console.error(`[media/proxy] storage fetch failed for ${scope} ${id}: HTTP ${got.status}`);
      throw new Error(`R2 fetch failed: ${got.status}`);
    }

    res.setHeader("Content-Type", got.headers.get("Content-Type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const arrayBuffer = await got.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error(`[media/proxy] failed for ${scope} ${id}:`, err);
    res.status(500).json({ error: "Image unavailable" });
  }
});

// GET /api/media/:scope/:id -> { url, expiresIn }
//
// The response carries a signed URL and nothing else: no object key, no bucket
// name, no permanent path. Errors are deliberately terse for the same reason.
router.get("/:scope/:id", async (req, res) => {
  const parse = z
    .object({ scope: z.enum(SCOPES), id: z.string().uuid() })
    .safeParse(req.params);
  if (!parse.success) return res.status(400).json({ error: "Bad request" });

  const me = req.userId!;
  if (overRateLimit(me)) {
    metric("media_rate_limited", { userId: me });
    return res.status(429).json({ error: "Too many image requests. Try again shortly." });
  }

  const { scope, id } = parse.data;
  const resolved =
    scope === "cloth"
      ? await resolveCloth(id, me)
      : scope === "selfie"
        ? await resolveTryonAsset(id, me, "selfie")
        : scope === "tryon"
          ? await resolveTryonAsset(id, me, "result")
          : await resolveListing(id, me);

  if ("error" in resolved) {
    if (resolved.error === 403) {
      // Worth knowing about; the record id is safe to log, the URL is not.
      metric("media_denied", { userId: me, scope, id });
    }
    return res.status(resolved.error).json({ error: "Not found" });
  }

  const key = keyFromUrl(resolved.url);
  if (!key) {
    // A row holding something that isn't ours to sign. Never echo the value.
    console.error(`[media] unrecognised storage reference on ${scope} ${id}`);
    return res.status(500).json({ error: "Image unavailable" });
  }

  res.json({ url: presignGet(key), expiresIn: SIGNED_GET_TTL_SECONDS });
});

export default router;
