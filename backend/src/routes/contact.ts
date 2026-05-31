// Contact-form endpoint. Requires login so we know the sender's email +
// name without trusting client-provided values. Emails go to the team
// inbox (GMAIL_USER) + shubhamsheshank63@gmail.com.
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { requireAuth } from "../services/auth.js";
import { sendContactEmail } from "../services/mailer.js";

const router = Router();
router.use(requireAuth);

router.post("/", async (req, res) => {
  const parse = z
    .object({
      subject: z.string().trim().max(200).optional(),
      message: z.string().trim().min(1).max(4000),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  try {
    await sendContactEmail({
      fromEmail: user.email,
      fromName: user.name,
      subject: parse.data.subject ?? null,
      message: parse.data.message,
    });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[contact] mail failed", e);
    res.status(500).json({ error: "Could not send. Try again later." });
  }
});

export default router;
