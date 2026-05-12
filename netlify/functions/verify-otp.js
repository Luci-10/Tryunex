const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const OTP_SECRET = process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_KEY;

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Returns true if the token is valid for this email + otp, false otherwise.
function verifyToken(token, email, otp) {
  if (!token || !email || !otp) return false;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return false;

  const payload = token.slice(0, dotIdx);
  const mac = token.slice(dotIdx + 1);

  // Recompute the expected MAC and compare in constant time
  const expectedMac = crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${payload}.${otp}`)
    .digest("hex");

  const macBuf = Buffer.from(mac, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");
  if (macBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(macBuf, expectedBuf)) return false;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return false;
  }

  if (data.email !== email) return false;
  if (Date.now() > data.exp) return false;

  return true;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  let email, otp, token;
  try {
    ({ email, otp, token } = JSON.parse(event.body || "{}"));
  } catch {
    return respond(400, { error: "Invalid request body" });
  }

  if (!email || !otp || !token) {
    return respond(400, { error: "Email, code, and token are required" });
  }

  if (!verifyToken(token, email, String(otp).trim())) {
    return respond(401, { error: "Invalid or expired code. Try again." });
  }

  const tempPassword = crypto.randomBytes(32).toString("hex");

  // Check profile first — if it exists we already have the user UUID
  const { data: existingProfile } = await db
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existingProfile?.id) {
    const { error: updateError } = await db.auth.admin.updateUserById(existingProfile.id, {
      password: tempPassword,
      email_confirm: true,
    });
    if (updateError) {
      console.error("updateUserById error:", updateError);
      return respond(500, { error: "Authentication failed. Try again." });
    }
    return respond(200, { ok: true, email, password: tempPassword, isNewUser: false });
  }

  // No profile — try to create the auth user with password already set
  const { data: createdData, error: createError } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (!createError && createdData?.user?.id) {
    return respond(200, { ok: true, email, password: tempPassword, isNewUser: true });
  }

  // Edge case: auth user exists but has no profile (incomplete onboarding)
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "https://tryunex.in" },
  });

  if (linkError || !linkData?.user?.id) {
    console.error("generateLink error:", linkError);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  const { error: updateError } = await db.auth.admin.updateUserById(linkData.user.id, {
    password: tempPassword,
    email_confirm: true,
  });

  if (updateError) {
    console.error("updateUserById error:", updateError);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  return respond(200, { ok: true, email, password: tempPassword, isNewUser: true });
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
