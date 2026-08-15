import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../services/auth.js";
import { getOnboarding, updateOnboarding } from "../services/onboarding.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  res.json({ onboarding: await getOnboarding(req.userId!) });
});

router.patch("/", async (req, res) => {
  const parse = z
    .object({
      status: z.enum(["not_started", "offered", "active", "completed", "skipped"]).optional(),
      currentStep: z.string().max(60).nullable().optional(),
      hint: z.enum(["wardrobe", "tryon", "plan", "chat"]).optional(),
    })
    .safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  res.json({ onboarding: await updateOnboarding(req.userId!, parse.data) });
});

export default router;
