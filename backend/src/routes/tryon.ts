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
import { GoogleGenAI } from "@google/genai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { clothes, shares, tryonAssets } from "../db/schema.js";
import { requireAuth } from "../services/auth.js";
import { presignPut, r2PublicBase } from "../services/r2.js";

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
  })();
  return schemaReady;
}

let cachedAi: GoogleGenAI | null = null;
function ai() {
  if (cachedAi) return cachedAi;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not set — try-on is not configured");
  }
  cachedAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return cachedAi;
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

// The generated image is an edit of the user's own photo, not a new person.
// Everything below is written to keep the model from "re-imagining" them —
// identity drift and leftover fragments of the original clothing are the two
// failure modes worth spending prompt tokens on.
const IDENTITY_RULES = `This is a photo edit, not a new photograph. The FIRST image is the person. Treat it as the source of truth for everything except the clothing being replaced.

Preserve exactly, without alteration:
- The face and all facial features, expression, and apparent age.
- Skin tone and complexion.
- Hair style, length, and colour.
- Body proportions, body shape, and size.
- Pose, posture, hand and arm position.
- Camera angle, framing, crop, and distance.
- Lighting direction, colour temperature, and shadows.
- The background, in full.

Never do any of the following:
- Slim, reshape, retouch, or otherwise "improve" the person.
- Change their age, expression, or pose.
- Add accessories, jewellery, watches, bags, hats, makeup, or tattoos that were not asked for.
- Add text, logos, watermarks, borders, collages, split panels, or extra people.
- Produce more than one image or view.`;

const REPLACEMENT_RULES = `Replacing the clothing:
- Change ONLY the body regions covered by the garments listed below.
- Fully remove and cover the original clothing in those regions. No fragments of the previous garment may remain — no old collar, neckline, sleeve ends, cuffs, hem, waistband, straps, buttons, logos, or pattern showing through or peeking out at the edges.
- Where the new garment is shorter or more open than the original, render the body or the underlying layer as it would naturally appear, not a remnant of the old clothing.
- Match each garment's colour, pattern, texture, and silhouette to its reference image faithfully.
- Leave every body region NOT covered by a listed garment exactly as it is in the first image — including footwear, if no footwear was selected.
- Render the result as one clean, realistic, full-frame fashion photograph.`;

const CATEGORY_ORDER = ["dress", "top", "outerwear", "bottom", "shoes", "accessory", "other"];

/**
 * Builds the instruction from the actual garments in the request. Naming each
 * reference image and its slot stops the model mixing up which picture goes
 * where, which is the main cause of garments landing on the wrong body part.
 */
function buildPrompt(items: { name: string; category: string }[]): string {
  const manifest = items
    .map((c, i) => `- IMAGE ${i + 2}: ${c.category} — "${c.name}"`)
    .join("\n");

  const cats = items.map((c) => c.category);
  const has = (c: string) => cats.includes(c);
  const countOf = (c: string) => cats.filter((x) => x === c).length;

  const notes: string[] = [];
  if (has("dress")) {
    notes.push(
      "The dress is a single full-body garment: it replaces both the upper and lower body clothing. Do not render a separate top or trousers underneath it.",
    );
  }
  if (countOf("top") > 1 || (has("top") && has("outerwear"))) {
    notes.push(
      "The tops are layered. Render the lighter/inner garment against the body and the heavier/outer one open or worn over it, so both stay visible and read as one deliberate outfit.",
    );
  }
  if (has("shoes")) {
    notes.push("Place the footwear on the feet, in correct perspective with the existing stance.");
  }
  if (has("accessory")) {
    notes.push(
      "Place each accessory where it is normally worn, at a natural scale. Do not invent any accessory that is not pictured.",
    );
  }
  if (!has("shoes")) {
    notes.push("No footwear was selected — keep the original shoes and feet untouched.");
  }

  const sorted = [...items].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
  const summary =
    sorted.length === 1
      ? `the single garment shown in IMAGE 2`
      : `all ${sorted.length} garments together as one complete outfit`;

  return [
    `Edit the FIRST image so the person is wearing ${summary}.`,
    "",
    "Garment reference images:",
    manifest,
    "",
    IDENTITY_RULES,
    "",
    REPLACEMENT_RULES,
    notes.length ? "\nFor this particular outfit:\n" + notes.map((n) => `- ${n}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
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
  const accessible = clothRows.filter(
    (c) => c.userId === req.userId || tryonAllowedOwners.has(c.userId),
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
  const clothIdsCsv = [...orderedClothes.map((c) => c.id)].sort().join(",");
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
    });
  }

  let client: GoogleGenAI;
  try {
    client = ai();
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "try-on misconfigured" });
  }

  try {
    const [selfie, ...garments] = await Promise.all([
      fetchAsBase64(selfieRow.imageUrl),
      ...orderedClothes.map((c) => fetchAsBase64(c.imageUrl)),
    ]);

    const generation = await client.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: selfie.mimeType, data: selfie.data } },
            ...garments.map((g) => ({ inlineData: { mimeType: g.mimeType, data: g.data } })),
            { text: buildPrompt(orderedClothes.map((c) => ({ name: c.name, category: c.category }))) },
          ],
        },
      ],
    });

    // The image block is buried inside candidates[].content.parts[] —
    // walk the structure looking for inlineData.
    let outImage: { data: string; mimeType: string } | null = null;
    const candidates = (generation as any).candidates ?? [];
    for (const cand of candidates) {
      for (const part of cand.content?.parts ?? []) {
        if (part.inlineData?.data) {
          outImage = {
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType ?? "image/png",
          };
          break;
        }
      }
      if (outImage) break;
    }
    if (!outImage) {
      return res.status(502).json({ error: "Gemini did not return an image" });
    }

    // Upload to R2 under tryons/<userId>/.
    const ext = outImage.mimeType.includes("png") ? "png" : "jpg";
    const key = `tryons/${req.userId}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
    const { uploadUrl, publicUrl } = await presignPut(key, outImage.mimeType);
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": outImage.mimeType },
      body: Buffer.from(outImage.data, "base64"),
    });
    if (!put.ok) {
      const body = await put.text();
      return res.status(502).json({ error: `R2 upload failed: ${put.status} ${body}` });
    }

    // Insert with cache keys (cloth_ids_csv + selfie_id) via raw SQL so
    // future calls with the same outfit + selfie hit the cache above.
    const inserted = (await sql`
      INSERT INTO tryon_assets (user_id, type, image_url, cloth_id, cloth_ids_csv, selfie_id)
      VALUES (${req.userId!}, 'result', ${publicUrl}, ${orderedClothes[0].id}, ${clothIdsCsv}, ${selfieRow.id})
      RETURNING id, image_url, created_at
    `) as Array<{ id: string; image_url: string; created_at: string }>;
    const row = inserted[0];
    res.json({
      result: {
        id: row.id,
        imageUrl: row.image_url,
        createdAt: row.created_at,
        clothId: orderedClothes[0].id,
      },
      clothes: orderedClothes,
      cached: false,
    });
  } catch (e: any) {
    console.error("[tryon] generate failed", e);
    res.status(500).json({ error: e?.message ?? "Generation failed" });
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
