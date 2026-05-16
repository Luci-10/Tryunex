import express from "express";
import cors from "cors";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json({ limit: "2mb" }));

// -- Supabase admin client --
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: ws } }
);

// -- Mailer --
const transport = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// -- HMAC OTP helpers --
function createToken(email, otp) {
  const exp = Date.now() + 15 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
  const mac = crypto.createHmac("sha256", process.env.OTP_SECRET).update(`${payload}.${otp}`).digest("hex");
  return `${payload}.${mac}`;
}

function verifyToken(token, email, otp) {
  if (!token || !email || !otp) return false;
  const dotIdx = token.lastIndexOf(".");
  const payload = token.slice(0, dotIdx);
  const mac = token.slice(dotIdx + 1);
  const expectedMac = crypto.createHmac("sha256", process.env.OTP_SECRET).update(`${payload}.${otp}`).digest("hex");
  const macBuf = Buffer.from(mac, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");
  if (macBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(macBuf, expectedBuf)) return false;
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return false; }
  if (data.email !== email) return false;
  if (Date.now() > data.exp) return false;
  return true;
}

// -- Auth routes --
app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email required" });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const token = createToken(email, otp);

  try {
    await transport.sendMail({
      from: `Tryunex <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Your Tryunex login code",
      text: `Your Tryunex login code: ${otp}\n\nExpires in 15 minutes.`,
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;background:#f9f9f7;border-radius:12px">
          <h2 style="color:#1a1a1a;margin:0 0 8px">Your Tryunex login code</h2>
          <p style="color:#555;margin:0 0 24px;font-size:14px">Enter this code to sign in. Expires in 15 minutes.</p>
          <div style="background:#fff;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a1a1a">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px;margin:0">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    res.json({ ok: true, token });
  } catch (err) {
    console.error("Email send error:", err.message);
    res.status(500).json({ error: "Could not send email. Try again." });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  const { email, otp, token } = req.body;
  if (!email || !otp || !token) return res.status(400).json({ error: "Email, code, and token are required" });
  if (!verifyToken(token, email, String(otp).trim())) return res.status(401).json({ error: "Invalid or expired code. Try again." });

  const tempPassword = crypto.randomBytes(32).toString("hex");

  const { data: profile } = await db.from("profiles").select("id").eq("email", email).single();
  if (profile?.id) {
    const { error } = await db.auth.admin.updateUserById(profile.id, { password: tempPassword, email_confirm: true });
    if (error) { console.error("updateUserById error:", error); return res.status(500).json({ error: "Authentication failed. Try again." }); }
    return res.json({ ok: true, email, password: tempPassword, isNewUser: false });
  }

  const { data: created, error: createErr } = await db.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
  if (!createErr && created?.user?.id) return res.json({ ok: true, email, password: tempPassword, isNewUser: true });

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: process.env.FRONTEND_URL || "http://localhost:5173" } });
  if (linkErr || !link?.user?.id) { console.error("generateLink error:", linkErr); return res.status(500).json({ error: "Authentication failed. Try again." }); }
  await db.auth.admin.updateUserById(link.user.id, { password: tempPassword, email_confirm: true });
  return res.json({ ok: true, email, password: tempPassword, isNewUser: true });
});

// -- AI route --
app.post("/api/ai/suggest", async (req, res) => {
  const { occasion, items } = req.body;
  if (!occasion || !items?.length) return res.status(400).json({ error: "Occasion and items are required" });

  const prompt = `You are a wardrobe stylist. Available clothing:
${items.map((i) => `- ${i.name} (${i.type}, ${i.color})`).join("\n")}

Suggest the best outfit for: "${occasion}"

Respond ONLY with JSON in this exact format:
{"top":"item name or null","bottom":"item name or null","shoes":"item name or null","extra":"item name or null","reason":"one sentence why"}`;

  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: "Add GROQ_API_KEY to enable AI suggestions." });
  }

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!groqRes.ok) {
    const err = await groqRes.text();
    console.error("Groq error:", err);
    return res.status(502).json({ error: "AI service unavailable. Try again." });
  }

  const groqData = await groqRes.json();
  const suggestion = JSON.parse(groqData.choices[0].message.content);
  res.json({ ok: true, suggestion, source: "groq/llama3" });
});

app.get("/health", (_, res) => res.json({ ok: true }));

export default app;
