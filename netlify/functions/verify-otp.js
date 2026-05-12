const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  let email, otp;
  try {
    ({ email, otp } = JSON.parse(event.body || "{}"));
  } catch {
    return respond(400, { error: "Invalid request body" });
  }

  if (!email || !otp) {
    return respond(400, { error: "Email and code are required" });
  }

  // Verify AND delete OTP in a single query — saves one round trip
  const { data: deletedRows, error: otpError } = await db
    .from("otp_tokens")
    .delete()
    .eq("email", email)
    .eq("otp", String(otp).trim())
    .gt("expires_at", new Date().toISOString())
    .select();

  if (otpError || !deletedRows?.length) {
    return respond(401, { error: "Invalid code. Try again." });
  }

  const tempPassword = crypto.randomBytes(32).toString("hex");

  // Check profile first — if it exists we already have the user UUID
  // and can skip the expensive generateLink call entirely
  const { data: existingProfile } = await db
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existingProfile?.id) {
    // Returning user: just update the password
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

  // No profile — try to create the auth user with password already set (one call)
  const { data: createdData, error: createError } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (!createError && createdData?.user?.id) {
    // Brand-new user — no profile yet
    return respond(200, { ok: true, email, password: tempPassword, isNewUser: true });
  }

  // Edge case: auth user exists but never finished onboarding (no profile)
  // Fall back to generateLink to get their UUID, then update password
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
