import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  generateOtp,
  issueOtpCookie,
  verifyOtpFromCookie,
  clearOtpCookie,
} from "../services/otp.js";
import { sendOtpEmail } from "../services/mailer.js";
import {
  signSessionToken,
  signPendingToken,
  setSessionCookie,
  setPendingCookie,
  clearSessionCookie,
  clearPendingCookie,
  getPendingEmail,
  getUserIdFromSession,
  loadUser,
} from "../services/auth.js";

const router = Router();

// POST /auth/start { email }
router.post("/start", async (req, res) => {
  const parse = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid email" });
  const email = parse.data.email.trim().toLowerCase();

  const otp = generateOtp();
  await issueOtpCookie(res, email, otp);
  try {
    await sendOtpEmail(email, otp);
  } catch (err) {
    console.error("sendOtpEmail failed:", err);
    return res.status(500).json({ error: "Could not send email. Check Gmail credentials." });
  }
  res.json({ ok: true });
});

// POST /auth/verify { email, otp }
router.post("/verify", async (req, res) => {
  const t0 = Date.now();
  const lap = (s: string) => console.log(`[verify] +${Date.now() - t0}ms ${s}`);
  const parse = z.object({
    email: z.string().email(),
    otp: z.string().length(6),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const email = parse.data.email.trim().toLowerCase();
  lap("parsed");

  const result = await verifyOtpFromCookie(req, res, email, parse.data.otp);
  lap("otp checked");
  if (!result.ok) {
    const msg = {
      no_request: "No code was requested — try sending a new one",
      expired: "Code expired — request a new one",
      too_many_attempts: "Too many attempts — request a new code",
      wrong: "Incorrect code",
      email_mismatch: "This code was sent to a different email — restart sign-in",
    }[result.reason];
    return res.status(400).json({ error: msg });
  }

  clearOtpCookie(res);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  lap("user select");
  if (existing[0]) {
    const token = await signSessionToken(existing[0].id);
    lap("session token signed");
    setSessionCookie(res, token);
    clearPendingCookie(res);
    return res.json({ status: "logged_in", user: existing[0] });
  }

  const pending = await signPendingToken(email);
  lap("pending token signed");
  setPendingCookie(res, pending);
  return res.json({ status: "needs_registration", email });
});

// POST /auth/complete { name, dob?, gender? } — requires pending cookie
router.post("/complete", async (req, res) => {
  const email = await getPendingEmail(req);
  if (!email) return res.status(401).json({ error: "Verify your email first" });

  const parse = z.object({
    name: z.string().trim().min(1).max(80),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional().nullable(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const dup = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (dup[0]) {
    const token = await signSessionToken(dup[0].id);
    setSessionCookie(res, token);
    clearPendingCookie(res);
    return res.json({ user: dup[0] });
  }

  const [u] = await db
    .insert(users)
    .values({
      email,
      name: parse.data.name,
      dob: parse.data.dob ?? null,
      gender: parse.data.gender ?? null,
    })
    .returning();

  const token = await signSessionToken(u.id);
  setSessionCookie(res, token);
  clearPendingCookie(res);
  res.json({ user: u });
});

router.get("/me", async (req, res) => {
  const id = await getUserIdFromSession(req);
  if (!id) return res.status(401).json({ error: "unauthorized" });
  const u = await loadUser(id);
  if (!u) return res.status(401).json({ error: "unauthorized" });
  res.json({ user: u });
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  clearPendingCookie(res);
  clearOtpCookie(res);
  res.json({ ok: true });
});

export default router;
