const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const transport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  let email, name;
  try {
    ({ email, name } = JSON.parse(event.body || "{}"));
  } catch {
    return respond(400, { error: "Invalid request body" });
  }

  if (!email || !email.includes("@")) {
    return respond(400, { error: "A valid email is required" });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: dbError } = await db
    .from("otp_tokens")
    .upsert(
      { email, otp, name: name || "", expires_at: expiresAt },
      { onConflict: "email" }
    );

  if (dbError) {
    console.error("DB error storing OTP:", dbError);
    return respond(500, { error: "Could not store code. Try again." });
  }

  try {
    await transport.sendMail({
      from: `Tryunex <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Your Tryunex login code",
      text: `Your Tryunex login code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;background:#f9f9f7;border-radius:12px">
          <h2 style="color:#1a1a1a;margin:0 0 8px">Your Tryunex login code</h2>
          <p style="color:#555;margin:0 0 24px;font-size:14px">Enter this code to sign in or create your account.</p>
          <div style="background:#fff;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
            <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a1a1a">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px;margin:0">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("Gmail send error:", emailError);
    return respond(500, { error: "Could not send email. Try again." });
  }

  return respond(200, { ok: true });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
