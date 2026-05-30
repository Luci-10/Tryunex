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
import { clothes, tryonAssets } from "../db/schema.js";
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

const SINGLE_PROMPT = `Generate a single realistic photograph showing the person from the FIRST image wearing the garment from the SECOND image.

Strict requirements:
- Keep the person's face, hairstyle, skin tone, and body proportions exactly as in the first image.
- Keep the lighting and background of the first image.
- Replace whatever they were wearing (in the relevant body region) with the garment from the second image. Match the garment's color, pattern, and silhouette accurately.
- Output one full-body or upper-body photo, naturally posed, no text or watermarks.`;

const MULTI_PROMPT = `Generate a single realistic photograph showing the person from the FIRST image wearing ALL of the garments from the subsequent images together as a complete outfit.

Strict requirements:
- Keep the person's face, hairstyle, skin tone, and body proportions exactly as in the first image.
- Keep the lighting and background of the first image.
- Layer the garments naturally (top + bottom + outerwear + shoes etc.) so each one is visible where it should be. Do not omit any garment.
- Match each garment's color, pattern, and silhouette accurately.
- Output one full-body photo, naturally posed, no text or watermarks.`;

router.post("/generate", async (req, res) => {
  await ensureSchema();
  // Accept either { clothId } (single, legacy) or { clothIds: [] } (one or
  // more). Cap at 5 garments per outfit — beyond that Gemini struggles and
  // input tokens balloon.
  const parse = z
    .object({
      clothId: z.string().min(1).optional(),
      clothIds: z.array(z.string().min(1)).min(1).max(5).optional(),
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

  const clothRows = await db
    .select()
    .from(clothes)
    .where(and(eq(clothes.userId, req.userId!), inArray(clothes.id, requestedIds)));
  if (clothRows.length === 0) return res.status(404).json({ error: "Cloth not found" });
  const byId = new Map(clothRows.map((c) => [c.id, c]));
  const orderedClothes = requestedIds.map((id) => byId.get(id)).filter(Boolean) as typeof clothRows;
  if (orderedClothes.length === 0) return res.status(404).json({ error: "Cloth not found" });

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
            { text: orderedClothes.length === 1 ? SINGLE_PROMPT : MULTI_PROMPT },
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

    // Store first cloth as the "primary" — history shows that cloth's
    // thumbnail. The composite image itself shows the full outfit.
    const [row] = await db
      .insert(tryonAssets)
      .values({
        userId: req.userId!,
        type: "result",
        imageUrl: publicUrl,
        clothId: orderedClothes[0].id,
      })
      .returning();
    res.json({ result: row, clothes: orderedClothes });
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
