import { Router } from "express";
import { db } from "../db/client.js";
import { clothes, wearEvents } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../services/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const rows = await db
    .select({
      id: wearEvents.id,
      wornOn: wearEvents.wornOn,
      createdAt: wearEvents.createdAt,
      clothName: clothes.name,
      clothImage: clothes.imageUrl,
      category: clothes.category,
      styleTag: clothes.styleTag,
    })
    .from(wearEvents)
    .innerJoin(clothes, eq(clothes.id, wearEvents.clothId))
    .where(eq(wearEvents.userId, req.userId!))
    .orderBy(desc(wearEvents.wornOn), desc(wearEvents.createdAt))
    .limit(500);

  res.json({ history: rows });
});

export default router;
