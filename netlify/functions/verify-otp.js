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

  // Look up and validate the OTP
  const { data: tokenRow, error: lookupError } = await db
    .from("otp_tokens")
    .select("*")
    .eq("email", email)
    .eq("otp", String(otp).trim())
    .gt("expires_at", new Date().toISOString())
    .single();

  if (lookupError || !tokenRow) {
    return respond(401, { error: "Invalid or expired code. Request a new one." });
  }

  // Single-use — delete immediately
  await db.from("otp_tokens").delete().eq("email", email);

  // Generate a Supabase magic-link token (creates auth user if new)
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "https://tryunex.in" },
  });

  if (linkError) {
    console.error("generateLink error:", linkError);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  const userId = linkData.user?.id;
  const hashedToken = linkData.properties?.hashed_token;

  if (!userId || !hashedToken) {
    return respond(500, { error: "Authentication failed. Try again." });
  }

  // Check if this is a new user (no profile yet)
  const { data: existingProfile } = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  const isNewUser = !existingProfile;

  return respond(200, { ok: true, token: hashedToken, email, isNewUser });
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
