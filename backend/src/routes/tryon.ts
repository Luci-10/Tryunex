// Virtual try-on via Gemini 2.5 Flash Image. The user uploads one selfie
// (one-time, stored in R2 under selfies/<userId>/), then taps any cloth to
// generate a composite showing them wearing it. Results are stored in R2
// under tryons/<userId>/ and indexed in the tryon_assets table.
//
// Selfie upload is browser-direct (presigned PUT to R2 — same pattern as
// cloth uploads). Generation runs server-side: backend fetches both images,
// sends them to Gemini, uploads the result to R2 via another presigned PUT.
import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { clothes, shares, tryonAssets, thriftListings } from "../db/schema.js";
import { requireAuth } from "../services/auth.js";
import { ensureThriftSchema } from "../services/thrift.js";
import { presignPut, r2PublicBase } from "../services/r2.js";
import { falConfigured, runVirtualTryOn, FalError, tryonMockEnabled } from "../services/fal.js";
import { buildGarmentSheet, normalisePersonImage, buildMockResult } from "../services/garmentSheet.js";
import {
  debitCredits,
  creditsForItems,
  MAX_LOOK_ITEMS,
  getBalance,
  grantFreeMonthlyCredit,
  refundCredit,
  ensureProfile,
  claimGenerationSlot,
  releaseGenerationSlot,
  recentGenerationCount,
  generationDisabled,
  GENERATION_RATE_LIMIT,
} from "../services/billing/credits.js";
import { metric } from "../services/metrics.js";

const router = Router();
router.use(requireAuth);

// One-shot CREATE TABLE IF NOT EXISTS on the first call so a fresh DB picks
// up the table without a separate migration step. Cached so it only runs
// once per cold start.
let schemaReady: Promise<void> | null = null;
async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      CREATE TABLE IF NOT EXISTS "tryon_assets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" text NOT NULL,
        "image_url" text NOT NULL,
        "cloth_id" uuid REFERENCES "clothes"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS "tryon_user_idx" ON "tryon_assets" ("user_id")`;
    await sql`CREATE INDEX IF NOT EXISTS "tryon_user_type_idx" ON "tryon_assets" ("user_id", "type", "created_at" DESC)`;
    // Cache columns: same outfit (sorted CSV of cloth ids) + same selfie =
    // cache hit, skip Gemini, return existing URL.
    await sql`ALTER TABLE "tryon_assets" ADD COLUMN IF NOT EXISTS "cloth_ids_csv" text`;
    await sql`ALTER TABLE "tryon_assets" ADD COLUMN IF NOT EXISTS "selfie_id" uuid`;
    await sql`CREATE INDEX IF NOT EXISTS "tryon_cache_idx" ON "tryon_assets" ("user_id", "cloth_ids_csv", "selfie_id")`;
    // Audit record per generation attempt — including the ones that failed,
    // which is exactly when you need to know what happened.
    await sql`
      CREATE TABLE IF NOT EXISTS "tryon_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "cloth_ids_csv" text NOT NULL,
        "item_count" integer NOT NULL,
        "credit_cost" integer NOT NULL,
        "idempotency_key" text NOT NULL,
        "provider" text NOT NULL DEFAULT 'fal-ai/flux-pro/v1/vto',
        "provider_request_id" text,
        "seed" bigint,
        "status" text NOT NULL,
        "result_url" text,
        "failure_reason" text,
        "regenerated" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz
      )`;
    await sql`CREATE INDEX IF NOT EXISTS "tryon_requests_user_idx" ON "tryon_requests" ("user_id", "created_at" DESC)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS "tryon_requests_idem_idx" ON "tryon_requests" ("idempotency_key")`;
  })();
  return schemaReady;
}

// ----- Selfie -----

// Hand back a presigned PUT URL for the user's selfie. Same flow as cloth
// upload (presign → browser PUTs → backend records the public URL).
router.post("/selfie/upload-url", async (_req, res) => {
  const userId = (res.req.userId as string)!;
  const key = `selfies/${userId}/${Date.now()}-${randomBytes(4).toString("hex")}.jpg`;
  try {
    const { uploadUrl, publicUrl } = await presignPut(key, "image/jpeg");
    res.json({ uploadUrl, publicUrl, key });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "presign failed" });
  }
});

// Record a uploaded selfie in tryon_assets. Client calls this AFTER the
// browser PUT completes so the URL is known-good.
router.post("/selfie", async (req, res) => {
  await ensureSchema();
  const parse = z.object({ imageUrl: z.string().url() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const expectedPrefix = `${r2PublicBase()}/selfies/${req.userId}/`;
  if (!parse.data.imageUrl.startsWith(expectedPrefix)) {
    return res.status(403).json({ error: "imageUrl is not in your selfies folder" });
  }
  const [row] = await db
    .insert(tryonAssets)
    .values({
      userId: req.userId!,
      type: "selfie",
      imageUrl: parse.data.imageUrl,
    })
    .returning();
  res.json({ selfie: row });
});

// Newest selfie = current.
router.get("/selfie", async (req, res) => {
  await ensureSchema();
  const rows = await db
    .select()
    .from(tryonAssets)
    .where(and(eq(tryonAssets.userId, req.userId!), eq(tryonAssets.type, "selfie")))
    .orderBy(desc(tryonAssets.createdAt))
    .limit(1);
  res.json({ selfie: rows[0] ?? null });
});

// ----- Generate -----

// Fetch a URL and return base64 + content type. Used to feed selfie + cloth
// images into the Gemini multimodal request.
async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not fetch ${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const mimeType = r.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  return { data: buf.toString("base64"), mimeType };
}

import { buildPrompt } from "../services/tryonPrompt.js";

/** Uploads a buffer to R2 through a presigned PUT and returns the public URL. */
async function putBuffer(key: string, body: Buffer, contentType = "image/jpeg"): Promise<string> {
  const { uploadUrl, publicUrl } = await presignPut(key, contentType);
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!put.ok) throw new Error(`R2 upload failed (HTTP ${put.status})`);
  return publicUrl;
}


router.post("/generate", async (req, res) => {
  await ensureSchema();
  // Accept either { clothId } (single, legacy) or { clothIds: [] } (one or
  // more). Cap at 5 garments per outfit — beyond that Gemini struggles and
  // input tokens balloon.
  const parse = z
    .object({
      clothId: z.string().min(1).optional(),
      clothIds: z.array(z.string().min(1)).min(1).max(5).optional(),
      // Set by the Regenerate action. Skips the cache lookup and stores the
      // new image as an additional result — the previous one is untouched.
      forceRegenerate: z.boolean().optional(),
      // Try-on role per cloth id, for garments whose wardrobe category is
      // "other" and therefore says nothing about where they belong on the
      // body. Never written back to the garment.
      roles: z
        .record(z.enum(["top", "bottom", "dress", "outerwear", "shoes", "accessory"]))
        .optional(),
    })
    .refine((v) => v.clothId || (v.clothIds && v.clothIds.length > 0), {
      message: "Provide clothId or clothIds",
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const requestedIds = parse.data.clothIds ?? [parse.data.clothId!];

  // Fetch current selfie + the target clothes (preserving requested order).
  const [selfieRow] = await db
    .select()
    .from(tryonAssets)
    .where(and(eq(tryonAssets.userId, req.userId!), eq(tryonAssets.type, "selfie")))
    .orderBy(desc(tryonAssets.createdAt))
    .limit(1);
  if (!selfieRow) return res.status(400).json({ error: "Upload a selfie first" });

  // Fetch any cloth in the requested set. Ownership check happens below so
  // we can support outfits that include friend's clothes (when the friend
  // granted try-on access via their share code).
  const clothRows = await db
    .select()
    .from(clothes)
    .where(inArray(clothes.id, requestedIds));
  if (clothRows.length === 0) return res.status(404).json({ error: "Cloth not found" });

  // Build the set of friend-owners whose clothes appear in this outfit, then
  // load shares for those owners and verify each grants try-on.
  const foreignOwnerIds = Array.from(
    new Set(clothRows.filter((c) => c.userId !== req.userId).map((c) => c.userId)),
  );
  let tryonAllowedOwners = new Set<string>();
  if (foreignOwnerIds.length > 0) {
    const shareRows = await db
      .select({ ownerId: shares.ownerId, allowTryon: shares.allowTryon })
      .from(shares)
      .where(and(eq(shares.viewerId, req.userId!), inArray(shares.ownerId, foreignOwnerIds)));
    tryonAllowedOwners = new Set(shareRows.filter((s) => s.allowTryon).map((s) => s.ownerId));
  }

  // Second route to a stranger's garment: it is actively listed on the thrift
  // marketplace. Anyone may preview a listed piece against their own selfie,
  // which is the whole point of "Try with my wardrobe" — and it reuses the
  // seller's existing R2 image rather than copying anything.
  //
  // The listing must still be `active` and the seller must still own the
  // piece, so pausing, selling or removing a listing withdraws try-on access
  // on the next request.
  const listedClothIds = new Set<string>();
  const foreignClothIds = clothRows.filter((c) => c.userId !== req.userId).map((c) => c.id);
  if (foreignClothIds.length > 0) {
    await ensureThriftSchema();
    const listed = await db
      .select({ clothId: thriftListings.sourceClothId, sellerId: thriftListings.sellerUserId })
      .from(thriftListings)
      .where(
        and(
          inArray(thriftListings.sourceClothId, foreignClothIds),
          eq(thriftListings.status, "active"),
        ),
      );
    const ownerOf = new Map(clothRows.map((c) => [c.id, c.userId]));
    for (const l of listed) {
      if (ownerOf.get(l.clothId) === l.sellerId) listedClothIds.add(l.clothId);
    }
  }

  const accessible = clothRows.filter(
    (c) =>
      c.userId === req.userId || tryonAllowedOwners.has(c.userId) || listedClothIds.has(c.id),
  );
  if (accessible.length !== clothRows.length) {
    return res
      .status(403)
      .json({ error: "One or more clothes aren't accessible for try-on" });
  }
  const byId = new Map(accessible.map((c) => [c.id, c]));
  const orderedClothes = requestedIds.map((id) => byId.get(id)).filter(Boolean) as typeof accessible;
  if (orderedClothes.length === 0) return res.status(404).json({ error: "Cloth not found" });

  // Cache: if we've already generated this exact outfit on this exact
  // selfie, skip Gemini and return the prior result. Saves $0.04 + 10s
  // per re-apply when the user toggles between outfits.
  // The role is part of what was generated, so it belongs in the cache key —
  // the same garments worn as a top versus a scarf are different images.
  const roleSuffix = parse.data.roles
    ? Object.entries(parse.data.roles)
        .filter(([id]) => orderedClothes.some((c) => c.id === id))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, role]) => `${id}:${role}`)
        .join("|")
    : "";
  const clothIdsCsv =
    [...orderedClothes.map((c) => c.id)].sort().join(",") + (roleSuffix ? `#${roleSuffix}` : "");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  // Ordered newest-first: once Regenerate has run, several rows share this
  // cache key and the most recent one is the one the user last saw.
  const cached = parse.data.forceRegenerate
    ? []
    : ((await sql`
        SELECT id, image_url, created_at FROM tryon_assets
        WHERE user_id = ${req.userId!}
          AND type = 'result'
          AND cloth_ids_csv = ${clothIdsCsv}
          AND selfie_id = ${selfieRow.id}
        ORDER BY created_at DESC
        LIMIT 1
      `) as Array<{ id: string; image_url: string; created_at: string }>);
  if (cached.length > 0) {
    metric("tryon_cache_hit", { userId: req.userId! });
    const c = cached[0];
    return res.json({
      result: {
        id: c.id,
        imageUrl: c.image_url,
        createdAt: c.created_at,
        clothId: orderedClothes[0].id,
      },
      clothes: orderedClothes,
      cached: true,
      regenerated: false,
      creditUsed: false,
      credits: await getBalance(req.userId!),
    });
  }

  if (!falConfigured() && !tryonMockEnabled()) {
    return res.status(500).json({ error: "Try-on is not configured" });
  }

  // ---- throttles -------------------------------------------------------
  // All three run before the debit, so a refused request never costs a credit.
  if (generationDisabled()) {
    metric("tryon_disabled", { userId: req.userId! });
    return res.status(503).json({
      code: "GENERATION_DISABLED",
      error: "Try-on generation is paused right now. Your credits are safe.",
    });
  }

  const recent = await recentGenerationCount(req.userId!);
  if (recent >= GENERATION_RATE_LIMIT) {
    metric("tryon_rate_limited", { userId: req.userId!, recent });
    return res.status(429).json({
      code: "GENERATION_RATE_LIMIT",
      error: `That's ${GENERATION_RATE_LIMIT} looks in an hour — give it a few minutes.`,
    });
  }

  // One image generation per user at a time: they are slow and expensive,
  // and a double-tap shouldn't start two.
  const slot = await claimGenerationSlot(req.userId!);
  if (!slot) {
    metric("tryon_busy", { userId: req.userId! });
    return res.status(409).json({
      code: "GENERATION_IN_PROGRESS",
      error: "A look is already being created. Give it a moment.",
    });
  }

  // ---- credits ---------------------------------------------------------
  // Everything above this line is free: cache hits, uploads, browsing. Only a
  // fresh Gemini call costs a credit, and it is taken before the call so a
  // user can never generate on an empty balance.
  await ensureProfile(req.userId!);
  await grantFreeMonthlyCredit(req.userId!);

  // Cost is driven by how many garments actually go to the provider. All
  // selected pieces are composed onto the one sheet FLUX VTO accepts, so the
  // selected count and the sent count are the same number.
  const itemCount = orderedClothes.length;
  const creditCost = creditsForItems(itemCount);

  const debitKind = parse.data.forceRegenerate ? "regenerate_debit" : "tryon_debit";
  // Keyed on user + outfit + selfie + a per-request nonce for forced runs, so
  // a duplicated click is one charge but a deliberate second variation is two.
  const debitKey = `gen:${req.userId!}:${selfieRow.id}:${clothIdsCsv}:${
    parse.data.forceRegenerate ? randomBytes(8).toString("hex") : "first"
  }`;

  const debit = await debitCredits(req.userId!, debitKind, debitKey, creditCost);
  if (!debit.ok) {
    await releaseGenerationSlot(req.userId!);
    const credits = await getBalance(req.userId!);
    metric("tryon_refused_no_credits", { userId: req.userId!, needed: creditCost });
    return res.status(402).json({
      code: "NO_TRYON_CREDITS",
      error:
        creditCost > 1
          ? `This look needs ${creditCost} Try-on credits`
          : "You're out of Try-on credits",
      credits,
      creditsRequired: creditCost,
      itemCount,
    });
  }
  metric("credits_debited", { userId: req.userId!, kind: debitKind });

  try {
    // FLUX VTO takes publicly readable URLs and exactly ONE garment image,
    // so both inputs are prepared here: the person image normalised to a
    // portrait ~0.79MP, and every selected garment composed onto a single
    // reference sheet. Both are uploaded to R2 for the provider to fetch.
    const [person, sheet] = await Promise.all([
      normalisePersonImage(selfieRow.imageUrl),
      buildGarmentSheet(
        orderedClothes.map((c) => ({
          imageUrl: c.imageUrl,
          role: parse.data.roles?.[c.id] ?? c.category,
        })),
      ),
    ]);

    const stamp = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const [personUrl, garmentUrl] = await Promise.all([
      putBuffer(`tryon-inputs/${req.userId}/${stamp}-person.jpg`, person.buffer),
      putBuffer(`tryon-inputs/${req.userId}/${stamp}-garments.jpg`, sheet.buffer),
    ]);

    const fresh = Boolean(parse.data.forceRegenerate);
    // A regenerate must be a genuinely new sample rather than the same image
    // again, so it carries a fresh seed. A first run leaves the seed unset.
    const seed = fresh ? randomBytes(4).readUInt32BE(0) % 2_147_483_647 : undefined;

    await sql`
      INSERT INTO tryon_requests
        (user_id, cloth_ids_csv, item_count, credit_cost, idempotency_key, seed, status, regenerated)
      VALUES (${req.userId!}, ${clothIdsCsv}, ${itemCount}, ${creditCost}, ${debitKey},
              ${seed ?? null}, 'started', ${fresh})
      ON CONFLICT (idempotency_key) DO NOTHING`;

    let vto;
    if (tryonMockEnabled()) {
      // Everything up to here is the real path — sizing, compositing, R2
      // upload, credits. Only the provider call is replaced.
      const mock = await buildMockResult(person.buffer, sheet.buffer);
      const mockUrl = await putBuffer(`tryons/${req.userId}/${stamp}.jpg`, mock, "image/jpeg");
      vto = { imageUrl: mockUrl, contentType: "image/jpeg", seed: seed ?? null, requestId: "mock", nsfw: false };
    } else {
    try {
      vto = await runVirtualTryOn({
        prompt: buildPrompt(
          orderedClothes.map((c) => ({
            name: c.name,
            category: c.category,
            role: parse.data.roles?.[c.id],
          })),
          { fresh },
        ),
        humanImageUrl: personUrl,
        garmentImageUrl: garmentUrl,
        ...(seed !== undefined ? { seed } : {}),
      });
    } catch (err: any) {
      // Nothing was produced, so the credit goes straight back.
      const reason = err instanceof FalError ? `${err.message}: ${err.detail}` : String(err?.message ?? err);
      console.error("[tryon] fal failed", reason);
      metric("generation_failed_fal", { userId: req.userId! });
      await sql`
        UPDATE tryon_requests SET status = 'failed', failure_reason = ${reason.slice(0, 500)},
               finished_at = now()
         WHERE idempotency_key = ${debitKey}`;
      await refundCredit(req.userId!, debitKey);
      await releaseGenerationSlot(req.userId!);
      metric("credits_refunded", { userId: req.userId! });
      return res.status(502).json({
        error: "The try-on service couldn't complete that look. Your credits haven't been used.",
        creditUsed: false,
        credits: await getBalance(req.userId!),
      });
    }
    }

    // Pull the result off the provider's CDN and store it in our own bucket,
    // so the cache and history never depend on their retention.
    const got = await fetch(vto.imageUrl);
    if (!got.ok) {
      metric("generation_failed_fetch", { userId: req.userId!, status: got.status });
      await sql`
        UPDATE tryon_requests SET status = 'failed',
               failure_reason = ${`result fetch HTTP ${got.status}`}, finished_at = now()
         WHERE idempotency_key = ${debitKey}`;
      await refundCredit(req.userId!, debitKey);
      await releaseGenerationSlot(req.userId!);
      metric("credits_refunded", { userId: req.userId! });
      return res.status(502).json({
        error: "Could not retrieve the generated image. Your credits haven't been used.",
        creditUsed: false,
        credits: await getBalance(req.userId!),
      });
    }
    const resultBuffer = Buffer.from(await got.arrayBuffer());
    const publicUrl = await putBuffer(
      `tryons/${req.userId}/${stamp}.jpg`,
      resultBuffer,
      "image/jpeg",
    );

    // Insert with cache keys (cloth_ids_csv + selfie_id) via raw SQL so
    // future calls with the same outfit + selfie hit the cache above.
    const inserted = (await sql`
      INSERT INTO tryon_assets (user_id, type, image_url, cloth_id, cloth_ids_csv, selfie_id)
      VALUES (${req.userId!}, 'result', ${publicUrl}, ${orderedClothes[0].id}, ${clothIdsCsv}, ${selfieRow.id})
      RETURNING id, image_url, created_at
    `) as Array<{ id: string; image_url: string; created_at: string }>;
    const row = inserted[0];
    await sql`
      UPDATE tryon_requests SET status = 'succeeded', result_url = ${publicUrl},
             provider_request_id = ${vto.requestId}, finished_at = now()
       WHERE idempotency_key = ${debitKey}`;
    if (fresh) {
      console.log(
        `[tryon] regenerated user=${req.userId} outfit=${clothIdsCsv} seed=${seed} result=${row.id}`,
      );
    }
    await releaseGenerationSlot(req.userId!);
    metric(fresh ? "tryon_regenerated" : "tryon_generated", { userId: req.userId! });
    res.json({
      result: {
        id: row.id,
        imageUrl: row.image_url,
        createdAt: row.created_at,
        clothId: orderedClothes[0].id,
      },
      clothes: orderedClothes,
      cached: false,
      regenerated: fresh,
      creditUsed: true,
      creditsUsed: creditCost,
      itemCount,
      credits: await getBalance(req.userId!),
    });
  } catch (e: any) {
    console.error("[tryon] generate failed", e);
    metric("tryon_failed", { userId: req.userId! });
    // Nothing usable was produced, so the credit goes back exactly once.
    await refundCredit(req.userId!, debitKey);
    await releaseGenerationSlot(req.userId!);
    res.status(500).json({
      error: e?.message ?? "Generation failed",
      creditUsed: false,
      credits: await getBalance(req.userId!),
    });
  }
});

// ----- History -----

router.get("/history", async (req, res) => {
  await ensureSchema();
  const rows = await db
    .select({
      id: tryonAssets.id,
      imageUrl: tryonAssets.imageUrl,
      createdAt: tryonAssets.createdAt,
      clothId: tryonAssets.clothId,
      clothName: clothes.name,
      clothImageUrl: clothes.imageUrl,
    })
    .from(tryonAssets)
    .leftJoin(clothes, eq(clothes.id, tryonAssets.clothId))
    .where(and(eq(tryonAssets.userId, req.userId!), eq(tryonAssets.type, "result")))
    .orderBy(desc(tryonAssets.createdAt))
    .limit(50);
  res.json({ results: rows });
});

router.delete("/:id", async (req, res) => {
  await ensureSchema();
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db
    .delete(tryonAssets)
    .where(and(eq(tryonAssets.id, id), eq(tryonAssets.userId, req.userId!)));
  res.json({ ok: true });
});

export default router;
