import { Router } from "express";
import crypto from "crypto";
import { createToken, verifyToken } from "../lib/otp.js";
import { sendOtpEmail } from "../lib/mailer.js";
import { db } from "../lib/supabase.js";

const router = Router();

router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const token = createToken(email, otp);

  try {
    await sendOtpEmail(email, otp);
    res.json({ ok: true, token });
  } catch (err) {
    console.error("Email send error:", err.message);
    res.status(500).json({ error: "Could not send email. Try again." });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { email, otp, token } = req.body;
  if (!email || !otp || !token) {
    return res.status(400).json({ error: "Email, code, and token are required" });
  }

  if (!verifyToken(token, email, String(otp).trim())) {
    return res.status(401).json({ error: "Invalid or expired code. Try again." });
  }

  const tempPassword = crypto.randomBytes(32).toString("hex");

  // Fast path: returning user with a profile — no generateLink needed
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (profile?.id) {
    const { error } = await db.auth.admin.updateUserById(profile.id, {
      password: tempPassword,
      email_confirm: true,
    });
    if (error) {
      console.error("updateUserById error:", error);
      return res.status(500).json({ error: "Authentication failed. Try again." });
    }
    return res.json({ ok: true, email, password: tempPassword, isNewUser: false });
  }

  // New user — create with password in one call
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (!createErr && created?.user?.id) {
    return res.json({ ok: true, email, password: tempPassword, isNewUser: true });
  }

  // Edge case: auth user exists but no profile (incomplete onboarding previously)
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: process.env.FRONTEND_URL || "http://localhost:5173" },
  });

  if (linkErr || !link?.user?.id) {
    console.error("generateLink error:", linkErr);
    return res.status(500).json({ error: "Authentication failed. Try again." });
  }

  await db.auth.admin.updateUserById(link.user.id, {
    password: tempPassword,
    email_confirm: true,
  });

  return res.json({ ok: true, email, password: tempPassword, isNewUser: true });
});

export default router;
