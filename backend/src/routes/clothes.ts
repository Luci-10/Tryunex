import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { clothes, wearEvents } from "../db/schema.js";
import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import { requireAuth } from "../services/auth.js";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const router = Router();
router.use(requireAuth);

// Signed-token endpoint for direct browser-to-Blob uploads.
// The client (AddClothModal) calls @vercel/blob/client's upload(), which
// POSTs here to get a short-lived token, then uploads the file straight to
// Blob storage. Bypasses Vercel's 4.5MB function body limit.
router.post("/upload-token", async (req, res) => {
  const userId = req.userId!;
  const fakeReq = new Request(
    new URL(req.originalUrl, `https://${req.get("host") ?? "x"}`),
    { method: req.method, headers: new Headers(req.headers as Record<string, string>) },
  );
  try {
    const json = await handleUpload({
      body: req.body as HandleUploadBody,
      request: fakeReq,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`clothes/${userId}/`)) {
          throw new Error("Pathname must be inside your folder");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8_000_000,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async () => {
        // No-op. Client POSTs metadata to / after the upload finishes.
      },
    });
    res.json(json);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "upload-token failed" });
  }
});

// GET /clothes?status=clean|worn
router.get("/", async (req, res) => {
  const status = req.query.status === "worn" ? "worn" : req.query.status === "clean" ? "clean" : null;
  const where = status
    ? and(eq(clothes.userId, req.userId!), eq(clothes.status, status))
    : eq(clothes.userId, req.userId!);
  const rows = await db.select().from(clothes).where(where).orderBy(desc(clothes.createdAt));
  res.json({ clothes: rows });
});

// POST /clothes  json: { imageUrl, name, category }
// imageUrl must be a Vercel Blob URL the client just uploaded to via
// /upload-token (which scopes pathnames to clothes/<userId>/).
router.post("/", async (req, res) => {
  const parse = z
    .object({
      imageUrl: z.string().url(),
      name: z.string().trim().min(1).max(80).default("Untitled"),
      category: z.string().trim().min(1).max(40).default("other"),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const url = new URL(parse.data.imageUrl);
  if (!url.hostname.endsWith(".blob.vercel-storage.com")) {
    return res.status(400).json({ error: "imageUrl must be a Vercel Blob URL" });
  }
  if (!url.pathname.startsWith(`/clothes/${req.userId}/`)) {
    return res.status(403).json({ error: "imageUrl is not in your folder" });
  }

  const [row] = await db
    .insert(clothes)
    .values({
      userId: req.userId! as unknown as number,
      name: parse.data.name,
      category: parse.data.category,
      imageUrl: parse.data.imageUrl,
    })
    .returning();
  res.json({ cloth: row });
});

// GET /clothes/:id — cloth + wear stats (for detail modal)
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad id" });
  const rows = await db
    .select()
    .from(clothes)
    .where(and(eq(clothes.id, id), eq(clothes.userId, req.userId!)))
    .limit(1);
  const cloth = rows[0];
  if (!cloth) return res.status(404).json({ error: "Not found" });
  const [stats] = await db
    .select({ wearCount: count(), lastWornOn: max(wearEvents.wornOn) })
    .from(wearEvents)
    .where(and(eq(wearEvents.userId, req.userId!), eq(wearEvents.clothId, id)));
  res.json({ cloth, wearCount: Number(stats?.wearCount ?? 0), lastWornOn: stats?.lastWornOn ?? null });
});

// PATCH /clothes/:id — rename / recategorize
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad id" });
  const parse = z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      category: z.string().trim().min(1).max(40).optional(),
    })
    .safeParse(req.body);
  if (!parse.success || (parse.data.name === undefined && parse.data.category === undefined)) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  const [row] = await db
    .update(clothes)
    .set({
      ...(parse.data.name !== undefined ? { name: parse.data.name } : {}),
      ...(parse.data.category !== undefined ? { category: parse.data.category } : {}),
    })
    .where(and(eq(clothes.id, id), eq(clothes.userId, req.userId!)))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ cloth: row });
});

// DELETE /clothes/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db.delete(clothes).where(and(eq(clothes.id, id), eq(clothes.userId, req.userId!)));
  res.json({ ok: true });
});

// POST /clothes/wear { ids: number[], date: 'YYYY-MM-DD' }
router.post("/wear", async (req, res) => {
  const parse = z
    .object({
      ids: z.array(z.number().int()).min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  await db
    .update(clothes)
    .set({ status: "worn" })
    .where(and(eq(clothes.userId, req.userId!), inArray(clothes.id, parse.data.ids)));
  await db
    .insert(wearEvents)
    .values(parse.data.ids.map((cid) => ({ clothId: cid, userId: req.userId!, wornOn: parse.data.date })));
  res.json({ ok: true });
});

// POST /clothes/reset — move all worn -> clean
router.post("/reset", async (req, res) => {
  await db
    .update(clothes)
    .set({ status: "clean" })
    .where(and(eq(clothes.userId, req.userId!), eq(clothes.status, "worn")));
  res.json({ ok: true });
});

// POST /clothes/:id/clean
router.post("/:id/clean", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db
    .update(clothes)
    .set({ status: "clean" })
    .where(and(eq(clothes.id, id), eq(clothes.userId, req.userId!)));
  res.json({ ok: true });
});

export default router;
