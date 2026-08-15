import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { clothes, wearEvents } from "../db/schema.js";
import { and, asc, count, desc, eq, gte, inArray, lt, max, notInArray } from "drizzle-orm";
import { requireAuth } from "../services/auth.js";
import { STYLE_TAGS } from "../db/schema.js";
import { presignPut, r2PublicBase } from "../services/r2.js";
import { settlePastPlans } from "../services/plans.js";

const router = Router();
router.use(requireAuth);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Hand the client a presigned R2 PUT URL scoped to the user's folder, plus
// the public URL the uploaded object will live at. The browser PUTs the file
// straight to R2 — Vercel functions are never in the upload path.
router.post("/upload-url", async (req, res) => {
  const parse = z
    .object({
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
      ext: z.enum(["jpg", "png", "webp"]).default("jpg"),
    })
    .safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const rand = randomBytes(6).toString("hex");
  const key = `clothes/${req.userId}/${Date.now()}-${rand}.${parse.data.ext}`;
  try {
    const { uploadUrl, publicUrl } = await presignPut(key, parse.data.contentType);
    res.json({ uploadUrl, publicUrl, key });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "presign failed" });
  }
});

// GET /clothes?status=clean|worn — also includes lastWornOn per cloth
// (most recent past wear_event) so the wardrobe grid can show "X days ago".
// Clothes with an active plan (unsettled wear_event for today / future) are
// hidden — they're committed, shouldn't be re-selectable.
router.get("/", async (req, res) => {
  await settlePastPlans(req.userId!);
  const status = req.query.status === "worn" ? "worn" : req.query.status === "clean" ? "clean" : null;
  const today = todayStr();
  const plannedClothIds = db
    .select({ id: wearEvents.clothId })
    .from(wearEvents)
    .where(
      and(
        eq(wearEvents.userId, req.userId!),
        eq(wearEvents.settled, false),
        gte(wearEvents.wornOn, today),
      ),
    );
  const baseWhere = status
    ? and(eq(clothes.userId, req.userId!), eq(clothes.status, status))
    : eq(clothes.userId, req.userId!);
  // Only hide planned clothes from the clean/wardrobe list — worn/all
  // queries can still surface them.
  const where = status === "clean"
    ? and(baseWhere, notInArray(clothes.id, plannedClothIds))
    : baseWhere;
  const rows = await db
    .select({
      id: clothes.id,
      userId: clothes.userId,
      name: clothes.name,
      category: clothes.category,
      styleTag: clothes.styleTag,
      imageUrl: clothes.imageUrl,
      status: clothes.status,
      createdAt: clothes.createdAt,
      lastWornOn: sql<string | null>`(
        SELECT MAX(${wearEvents.wornOn})::text
        FROM ${wearEvents}
        WHERE ${wearEvents.clothId} = ${clothes.id} AND ${wearEvents.settled} = true
      )`,
    })
    .from(clothes)
    .where(where)
    .orderBy(desc(clothes.createdAt));
  res.json({ clothes: rows });
});

// GET /clothes/plans — upcoming planned outfits (today + future, not yet settled)
router.get("/plans", async (req, res) => {
  await settlePastPlans(req.userId!);
  const today = todayStr();
  const rows = await db
    .select({
      id: wearEvents.id,
      wornOn: wearEvents.wornOn,
      cloth: {
        id: clothes.id,
        name: clothes.name,
        category: clothes.category,
        styleTag: clothes.styleTag,
        imageUrl: clothes.imageUrl,
        status: clothes.status,
      },
    })
    .from(wearEvents)
    .innerJoin(clothes, eq(clothes.id, wearEvents.clothId))
    .where(
      and(
        eq(wearEvents.userId, req.userId!),
        gte(wearEvents.wornOn, today),
        eq(wearEvents.settled, false),
      ),
    )
    .orderBy(asc(wearEvents.wornOn));
  res.json({ plans: rows });
});

// DELETE /clothes/plans/:id — cancel an upcoming plan
router.delete("/plans/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db
    .delete(wearEvents)
    .where(
      and(
        eq(wearEvents.id, id),
        eq(wearEvents.userId, req.userId!),
        eq(wearEvents.settled, false),
      ),
    );
  res.json({ ok: true });
});

// POST /clothes  json: { imageUrl, name, category }
// imageUrl must point at our R2 bucket, in the user's clothes/<userId>/ folder.
router.post("/", async (req, res) => {
  const parse = z
    .object({
      imageUrl: z.string().url(),
      name: z.string().trim().min(1).max(80).default("Untitled"),
      category: z.string().trim().min(1).max(40).default("other"),
      // Optional so older clients that predate tags keep working; the
      // column default backs this up at the database level too.
      styleTag: z.enum(STYLE_TAGS).optional(),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const expectedPrefix = `${r2PublicBase()}/clothes/${req.userId}/`;
  if (!parse.data.imageUrl.startsWith(expectedPrefix)) {
    return res.status(403).json({ error: "imageUrl is not in your R2 folder" });
  }

  const [row] = await db
    .insert(clothes)
    .values({
      userId: req.userId!,
      name: parse.data.name,
      category: parse.data.category,
      ...(parse.data.styleTag !== undefined ? { styleTag: parse.data.styleTag } : {}),
      imageUrl: parse.data.imageUrl,
    })
    .returning();
  res.json({ cloth: row });
});

// GET /clothes/:id — cloth + wear stats (for detail modal)
router.get("/:id", async (req, res) => {
  const id = req.params.id;
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
    .where(and(eq(wearEvents.userId, req.userId!), eq(wearEvents.clothId, id), eq(wearEvents.settled, true)));
  res.json({ cloth, wearCount: Number(stats?.wearCount ?? 0), lastWornOn: stats?.lastWornOn ?? null });
});

// PATCH /clothes/:id — rename / recategorize
router.patch("/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  const parse = z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      category: z.string().trim().min(1).max(40).optional(),
      styleTag: z.enum(STYLE_TAGS).optional(),
    })
    .safeParse(req.body);
  if (
    !parse.success ||
    (parse.data.name === undefined &&
      parse.data.category === undefined &&
      parse.data.styleTag === undefined)
  ) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  const [row] = await db
    .update(clothes)
    .set({
      ...(parse.data.name !== undefined ? { name: parse.data.name } : {}),
      ...(parse.data.category !== undefined ? { category: parse.data.category } : {}),
      ...(parse.data.styleTag !== undefined ? { styleTag: parse.data.styleTag } : {}),
    })
    .where(and(eq(clothes.id, id), eq(clothes.userId, req.userId!)))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ cloth: row });
});

// DELETE /clothes/:id
router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db.delete(clothes).where(and(eq(clothes.id, id), eq(clothes.userId, req.userId!)));
  res.json({ ok: true });
});

// POST /clothes/wear { ids } — immediate wear (today). Marks worn + records
// a settled wear_event. Used by the "Wear today" buttons on cloth cards.
router.post("/wear", async (req, res) => {
  const parse = z
    .object({ ids: z.array(z.string().min(1)).min(1) })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const today = todayStr();
  await db
    .update(clothes)
    .set({ status: "worn" })
    .where(and(eq(clothes.userId, req.userId!), inArray(clothes.id, parse.data.ids)));
  await db.insert(wearEvents).values(
    parse.data.ids.map((cid) => ({
      clothId: cid,
      userId: req.userId!,
      wornOn: today,
      settled: true,
    })),
  );
  res.json({ ok: true });
});

// POST /clothes/plan { ids, date } — schedule clothes for today or a future
// date. Doesn't change cloth status; settle helper flips them to worn when
// the date passes.
router.post("/plan", async (req, res) => {
  const parse = z
    .object({
      ids: z.array(z.string().min(1)).min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  if (parse.data.date < todayStr()) {
    return res.status(400).json({ error: "Can't plan for a past date" });
  }
  await db.insert(wearEvents).values(
    parse.data.ids.map((cid) => ({
      clothId: cid,
      userId: req.userId!,
      wornOn: parse.data.date,
      settled: false,
    })),
  );
  res.json({ ok: true });
});

// POST /clothes/reset — move all worn -> clean (the laundry button). Also
// settles any straggler past wear_events so the next /clothes read doesn't
// silently undo the reset.
router.post("/reset", async (req, res) => {
  const today = todayStr();
  await db
    .update(clothes)
    .set({ status: "clean" })
    .where(and(eq(clothes.userId, req.userId!), eq(clothes.status, "worn")));
  await db
    .update(wearEvents)
    .set({ settled: true })
    .where(
      and(
        eq(wearEvents.userId, req.userId!),
        lt(wearEvents.wornOn, today),
        eq(wearEvents.settled, false),
      ),
    );
  res.json({ ok: true });
});

// POST /clothes/:id/clean
router.post("/:id/clean", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db
    .update(clothes)
    .set({ status: "clean" })
    .where(and(eq(clothes.id, id), eq(clothes.userId, req.userId!)));
  res.json({ ok: true });
});

export default router;
