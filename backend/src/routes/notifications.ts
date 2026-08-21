import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../services/auth.js";
import { listNotifications, markRead } from "../services/notifications.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  res.json(await listNotifications(req.userId!));
});

// Body may name a single notification; omitting it marks everything read.
router.post("/read", async (req, res) => {
  const parse = z.object({ id: z.string().uuid().optional() }).safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  await markRead(req.userId!, parse.data.id);
  res.json(await listNotifications(req.userId!));
});

export default router;
