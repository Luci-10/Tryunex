import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { clothes, shareCodes, shares, suggestions, users, wearEvents } from "../db/schema.js";
import { and, asc, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { requireAuth } from "../services/auth.js";
import { settlePastPlans } from "../services/plans.js";
import { randomBytes } from "node:crypto";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// One-time additive migration for the allow_tryon flag on share_codes and
// shares. Idempotent — runs once per cold start, no separate migration step.
let shareSchemaReady: Promise<void> | null = null;
async function ensureShareSchema() {
  if (shareSchemaReady) return shareSchemaReady;
  shareSchemaReady = (async () => {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    await sql`ALTER TABLE share_codes ADD COLUMN IF NOT EXISTS allow_tryon BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE shares ADD COLUMN IF NOT EXISTS allow_tryon BOOLEAN NOT NULL DEFAULT false`;
  })();
  return shareSchemaReady;
}

// Mount at root: this router owns /share/*, /friends/*, /suggestions/*.
const router = Router();
router.use(requireAuth);

function newCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

// --- Owner: codes ---

router.get("/share/codes", async (req, res) => {
  await ensureShareSchema();
  const rows = await db
    .select()
    .from(shareCodes)
    .where(and(eq(shareCodes.ownerId, req.userId!), eq(shareCodes.used, false)))
    .orderBy(desc(shareCodes.createdAt));
  res.json({ codes: rows });
});

router.post("/share/codes", async (req, res) => {
  await ensureShareSchema();
  const parse = z
    .object({
      permission: z.enum(["view", "suggest", "edit"]),
      allowTryon: z.boolean().optional().default(false),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid permission" });
  const code = newCode();
  const [row] = await db
    .insert(shareCodes)
    .values({
      ownerId: req.userId!,
      code,
      permission: parse.data.permission,
      allowTryon: parse.data.allowTryon,
    })
    .returning();
  res.json({ code: row });
});

router.delete("/share/codes/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db.delete(shareCodes).where(and(eq(shareCodes.id, id), eq(shareCodes.ownerId, req.userId!)));
  res.json({ ok: true });
});

// --- Viewer: redeem ---

router.post("/share/redeem", async (req, res) => {
  await ensureShareSchema();
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
    await db
      .update(shares)
      .set({ permission: sc.permission, allowTryon: sc.allowTryon })
      .where(eq(shares.id, existing[0].id));
  } else {
    await db.insert(shares).values({
      ownerId: sc.ownerId,
      viewerId: req.userId!,
      permission: sc.permission,
      allowTryon: sc.allowTryon,
    });
  }
  await db.update(shareCodes).set({ used: true }).where(eq(shareCodes.id, sc.id));
  res.json({ ok: true, ownerId: sc.ownerId });
});

// --- Lists ---

router.get("/share/with-me", async (req, res) => {
  await ensureShareSchema();
  const rows = await db
    .select({
      id: shares.id,
      permission: shares.permission,
      allowTryon: shares.allowTryon,
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
  await ensureShareSchema();
  const rows = await db
    .select({
      id: shares.id,
      permission: shares.permission,
      allowTryon: shares.allowTryon,
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
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db.delete(shares).where(and(eq(shares.id, id), eq(shares.ownerId, req.userId!)));
  res.json({ ok: true });
});

router.delete("/share/:id/viewer", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  await db.delete(shares).where(and(eq(shares.id, id), eq(shares.viewerId, req.userId!)));
  res.json({ ok: true });
});

// --- Friend wardrobe view + actions ---

router.get("/friends/:ownerId/wardrobe", async (req, res) => {
  await ensureShareSchema();
  const ownerId = req.params.ownerId;
  if (!ownerId) return res.status(400).json({ error: "Bad id" });
  const shareRows = await db
    .select()
    .from(shares)
    .where(and(eq(shares.ownerId, ownerId), eq(shares.viewerId, req.userId!)))
    .limit(1);
  const share = shareRows[0];
  if (!share) return res.status(403).json({ error: "No access" });

  // Owner doesn't need to log in for their past plans to take effect.
  await settlePastPlans(ownerId);

  const ownerRows = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
  const owner = ownerRows[0];
  if (!owner) return res.status(404).json({ error: "Not found" });

  const plannedClothIds = db
    .select({ id: wearEvents.clothId })
    .from(wearEvents)
    .where(
      and(
        eq(wearEvents.userId, ownerId),
        eq(wearEvents.settled, false),
        gte(wearEvents.wornOn, todayStr()),
      ),
    );
  const items = await db
    .select()
    .from(clothes)
    .where(
      and(
        eq(clothes.userId, ownerId),
        eq(clothes.status, "clean"),
        notInArray(clothes.id, plannedClothIds),
      ),
    )
    .orderBy(desc(clothes.createdAt));

  const plans = await db
    .select({
      id: wearEvents.id,
      wornOn: wearEvents.wornOn,
      cloth: {
        id: clothes.id,
        name: clothes.name,
        category: clothes.category,
        imageUrl: clothes.imageUrl,
        status: clothes.status,
      },
    })
    .from(wearEvents)
    .innerJoin(clothes, eq(clothes.id, wearEvents.clothId))
    .where(
      and(
        eq(wearEvents.userId, ownerId),
        gte(wearEvents.wornOn, todayStr()),
        eq(wearEvents.settled, false),
      ),
    )
    .orderBy(asc(wearEvents.wornOn));

  res.json({
    permission: share.permission,
    allowTryon: share.allowTryon,
    owner: { id: owner.id, name: owner.name },
    clothes: items,
    plans,
  });
});

router.post("/friends/:ownerId/suggest", async (req, res) => {
  const ownerId = req.params.ownerId;
  if (!ownerId) return res.status(400).json({ error: "Bad id" });

  const parse = z
    .object({
      clothIds: z.array(z.string().min(1)).min(1),
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

// Editor permission can SCHEDULE outfits on the owner's behalf (not mark
// directly worn — owner decides when/if to actually flip them). Inserts
// wear_events under the owner's userId; settle helper flips status when
// the date passes.
router.post("/friends/:ownerId/plan", async (req, res) => {
  const ownerId = req.params.ownerId;
  if (!ownerId) return res.status(400).json({ error: "Bad id" });

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

  const shareRows = await db
    .select()
    .from(shares)
    .where(and(eq(shares.ownerId, ownerId), eq(shares.viewerId, req.userId!)))
    .limit(1);
  const share = shareRows[0];
  if (!share || share.permission !== "edit") return res.status(403).json({ error: "Not allowed" });

  await db.insert(wearEvents).values(
    parse.data.ids.map((cid) => ({
      clothId: cid,
      userId: ownerId,
      wornOn: parse.data.date,
      settled: false,
    })),
  );
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
    new Set(rows.flatMap((r) => r.clothIds.split(",").filter(Boolean))),
  );
  const clothMap = new Map<string, { id: string; name: string; imageUrl: string }>();
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
        .filter(Boolean)
        .map((x) => clothMap.get(x))
        .filter(Boolean),
    })),
  });
});

router.post("/suggestions/:id/respond", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Bad id" });
  const parse = z.object({ accept: z.boolean() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const rows = await db.select().from(suggestions).where(eq(suggestions.id, id)).limit(1);
  const s = rows[0];
  if (!s || s.ownerId !== req.userId!) return res.status(404).json({ error: "Not found" });

  if (parse.data.accept) {
    const ids = s.clothIds.split(",").filter(Boolean);
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
