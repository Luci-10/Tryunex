const crypto = require("crypto");
const nodemailer = require("nodemailer");

const OTP_SECRET = process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_KEY;

const transport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Creates a signed token: base64url(payload).hmac
// The HMAC covers both the payload and the raw OTP so the token is useless without the OTP.
function createToken(email, otp) {
  const exp = Date.now() + 15 * 60 * 1000; // 15 minutes
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
  const mac = crypto.createHmac("sha256", OTP_SECRET).update(`${payload}.${otp}`).digest("hex");
  return `${payload}.${mac}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  let email;
  try {
    ({ email } = JSON.parse(event.body || "{}"));
  } catch {
    return respond(400, { error: "Invalid request body" });
  }

  if (!email || !email.includes("@")) {
    return respond(400, { error: "A valid email is required" });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const token = createToken(email, otp);

  try {
    await transport.sendMail({
      from: `Tryunex <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Your Tryunex login code",
      text: `Your Tryunex login code is: ${otp}\n\nIf you didn't request this, ignore this email.`,
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;background:#f9f9f7;border-radius:12px">
          <h2 style="color:#1a1a1a;margin:0 0 8px">Your Tryunex login code</h2>
          <p style="color:#555;margin:0 0 24px;font-size:14px">Enter this 6-digit code to sign in or create your account.</p>
          <div style="background:#fff;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a1a1a">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px;margin:0">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("Gmail send error:", emailError);
    return respond(500, { error: "Could not send email. Try again." });
  }

  return respond(200, { ok: true, token });
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
