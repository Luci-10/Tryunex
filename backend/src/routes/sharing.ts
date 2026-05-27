import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { clothes, shareCodes, shares, suggestions, users, wearEvents } from "../db/schema.js";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireAuth } from "../services/auth.js";
import { randomBytes } from "node:crypto";

// Mount at root: this router owns /share/*, /friends/*, /suggestions/*.
const router = Router();
router.use(requireAuth);

function newCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

// --- Owner: codes ---

router.get("/share/codes", async (req, res) => {
  const rows = await db
    .select()
    .from(shareCodes)
    .where(and(eq(shareCodes.ownerId, req.userId!), eq(shareCodes.used, false)))
    .orderBy(desc(shareCodes.createdAt));
  res.json({ codes: rows });
});

router.post("/share/codes", async (req, res) => {
  const parse = z.object({ permission: z.enum(["view", "suggest", "edit"]) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid permission" });
  const code = newCode();
  const [row] = await db
    .insert(shareCodes)
    .values({ ownerId: req.userId!, code, permission: parse.data.permission })
    .returning();
  res.json({ code: row });
});

router.delete("/share/codes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db.delete(shareCodes).where(and(eq(shareCodes.id, id), eq(shareCodes.ownerId, req.userId!)));
  res.json({ ok: true });
});

// --- Viewer: redeem ---

router.post("/share/redeem", async (req, res) => {
  const parse = z.object({ code: z.string().min(1) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid code" });
  const code = parse.data.code.trim().toUpperCase();

  const rows = await db.select().from(shareCodes).where(eq(shareCodes.code, code)).limit(1);
  const sc = rows[0];
  if (!sc) return res.status(404).json({ error: "Code not found" });
  if (sc.used) return res.status(400).json({ error: "Code already used" });
  if (sc.ownerId === req.userId!) return res.status(400).json({ error: "You can't share with yourself" });

  const existing = await db
    .select()
    .from(shares)
    .where(and(eq(shares.ownerId, sc.ownerId), eq(shares.viewerId, req.userId!)))
    .limit(1);
  if (existing[0]) {
    await db.update(shares).set({ permission: sc.permission }).where(eq(shares.id, existing[0].id));
  } else {
    await db
      .insert(shares)
      .values({ ownerId: sc.ownerId, viewerId: req.userId!, permission: sc.permission });
  }
  await db.update(shareCodes).set({ used: true }).where(eq(shareCodes.id, sc.id));
  res.json({ ok: true, ownerId: sc.ownerId });
});

// --- Lists ---

router.get("/share/with-me", async (req, res) => {
  const rows = await db
    .select({
      id: shares.id,
      permission: shares.permission,
      createdAt: shares.createdAt,
      viewerId: users.id,
      viewerName: users.name,
      viewerEmail: users.email,
    })
    .from(shares)
    .innerJoin(users, eq(users.id, shares.viewerId))
    .where(eq(shares.ownerId, req.userId!));
  res.json({ shares: rows });
});

router.get("/share/i-can-see", async (req, res) => {
  const rows = await db
    .select({
      id: shares.id,
      permission: shares.permission,
      ownerId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(shares)
    .innerJoin(users, eq(users.id, shares.ownerId))
    .where(eq(shares.viewerId, req.userId!));
  res.json({ shares: rows });
});

router.delete("/share/:id/owner", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db.delete(shares).where(and(eq(shares.id, id), eq(shares.ownerId, req.userId!)));
  res.json({ ok: true });
});

router.delete("/share/:id/viewer", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db.delete(shares).where(and(eq(shares.id, id), eq(shares.viewerId, req.userId!)));
  res.json({ ok: true });
});

// --- Friend wardrobe view + actions ---

router.get("/friends/:ownerId/wardrobe", async (req, res) => {
  const ownerId = Number(req.params.ownerId);
  if (!ownerId) return res.status(400).json({ error: "Bad id" });
  const shareRows = await db
    .select()
    .from(shares)
    .where(and(eq(shares.ownerId, ownerId), eq(shares.viewerId, req.userId!)))
    .limit(1);
  const share = shareRows[0];
  if (!share) return res.status(403).json({ error: "No access" });

  const ownerRows = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
  const owner = ownerRows[0];
  if (!owner) return res.status(404).json({ error: "Not found" });

  const items = await db
    .select()
    .from(clothes)
    .where(and(eq(clothes.userId, ownerId), eq(clothes.status, "clean")))
    .orderBy(desc(clothes.createdAt));
  res.json({
    permission: share.permission,
    owner: { id: owner.id, name: owner.name },
    clothes: items,
  });
});

router.post("/friends/:ownerId/suggest", async (req, res) => {
  const ownerId = Number(req.params.ownerId);
  if (!ownerId) return res.status(400).json({ error: "Bad id" });

  const parse = z
    .object({
      clothIds: z.array(z.number().int()).min(1),
      note: z.string().max(500).optional().nullable(),
      forDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const shareRows = await db
    .select()
    .from(shares)
    .where(and(eq(shares.ownerId, ownerId), eq(shares.viewerId, req.userId!)))
    .limit(1);
  const share = shareRows[0];
  if (!share || (share.permission !== "suggest" && share.permission !== "edit")) {
    return res.status(403).json({ error: "Not allowed" });
  }

  await db.insert(suggestions).values({
    ownerId,
    suggesterId: req.userId!,
    clothIds: parse.data.clothIds.join(","),
    note: parse.data.note ?? null,
    forDate: parse.data.forDate ?? null,
  });
  res.json({ ok: true });
});

router.post("/friends/:ownerId/wear", async (req, res) => {
  const ownerId = Number(req.params.ownerId);
  if (!ownerId) return res.status(400).json({ error: "Bad id" });

  const parse = z
    .object({
      ids: z.array(z.number().int()).min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const shareRows = await db
    .select()
    .from(shares)
    .where(and(eq(shares.ownerId, ownerId), eq(shares.viewerId, req.userId!)))
    .limit(1);
  const share = shareRows[0];
  if (!share || share.permission !== "edit") return res.status(403).json({ error: "Not allowed" });

  await db
    .update(clothes)
    .set({ status: "worn" })
    .where(and(eq(clothes.userId, ownerId), inArray(clothes.id, parse.data.ids)));
  await db
    .insert(wearEvents)
    .values(parse.data.ids.map((cid) => ({ clothId: cid, userId: ownerId, wornOn: parse.data.date })));
  res.json({ ok: true });
});

// --- Suggestions inbox ---

router.get("/suggestions", async (req, res) => {
  const rows = await db
    .select({
      id: suggestions.id,
      clothIds: suggestions.clothIds,
      note: suggestions.note,
      forDate: suggestions.forDate,
      createdAt: suggestions.createdAt,
      suggesterName: users.name,
    })
    .from(suggestions)
    .innerJoin(users, eq(users.id, suggestions.suggesterId))
    .where(and(eq(suggestions.ownerId, req.userId!), eq(suggestions.status, "pending")))
    .orderBy(desc(suggestions.createdAt));

  const allIds = Array.from(
    new Set(rows.flatMap((r) => r.clothIds.split(",").map((x) => Number(x)).filter(Boolean))),
  );
  const clothMap = new Map<number, { id: number; name: string; imageUrl: string }>();
  if (allIds.length) {
    const cs = await db
      .select({ id: clothes.id, name: clothes.name, imageUrl: clothes.imageUrl })
      .from(clothes)
      .where(inArray(clothes.id, allIds));
    cs.forEach((c) => clothMap.set(c.id, c));
  }

  res.json({
    suggestions: rows.map((r) => ({
      ...r,
      clothes: r.clothIds
        .split(",")
        .map((x) => clothMap.get(Number(x)))
        .filter(Boolean),
    })),
  });
});

router.post("/suggestions/:id/respond", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Bad id" });
  const parse = z.object({ accept: z.boolean() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const rows = await db.select().from(suggestions).where(eq(suggestions.id, id)).limit(1);
  const s = rows[0];
  if (!s || s.ownerId !== req.userId!) return res.status(404).json({ error: "Not found" });

  if (parse.data.accept) {
    const ids = s.clothIds.split(",").map((x) => Number(x)).filter(Boolean);
    const wornOn = s.forDate ?? new Date().toISOString().slice(0, 10);
    if (ids.length) {
      await db
        .update(clothes)
        .set({ status: "worn" })
        .where(and(eq(clothes.userId, req.userId!), inArray(clothes.id, ids)));
      await db
        .insert(wearEvents)
        .values(ids.map((cid) => ({ clothId: cid, userId: req.userId!, wornOn })));
    }
    await db.update(suggestions).set({ status: "accepted" }).where(eq(suggestions.id, id));
  } else {
    await db.update(suggestions).set({ status: "declined" }).where(eq(suggestions.id, id));
  }
  res.json({ ok: true });
});

export default router;
