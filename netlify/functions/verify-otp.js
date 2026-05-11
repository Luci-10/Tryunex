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

  // Verify our 6-digit OTP from the table
  const { data: tokenRow, error: lookupError } = await db
    .from("otp_tokens")
    .select("*")
    .eq("email", email)
    .eq("otp", String(otp).trim())
    .gt("expires_at", new Date().toISOString())
    .single();

  if (lookupError || !tokenRow) {
    return respond(401, { error: "Invalid code. Try again." });
  }

  // Single-use — delete immediately
  await db.from("otp_tokens").delete().eq("email", email);

  // Generate a fresh Supabase magic link (creates auth user if new)
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "https://tryunex.in" },
  });

  if (linkError) {
    console.error("generateLink error:", linkError);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  // Extract the raw token from the action_link URL.
  // verifyOtp on the client expects the raw token (Supabase hashes it internally).
  // Do NOT use hashed_token — that causes "token expired" because it gets double-hashed.
  const actionLink = linkData.properties?.action_link;
  const rawToken = actionLink ? new URL(actionLink).searchParams.get("token") : null;

  if (!rawToken) {
    return respond(500, { error: "Authentication failed. Try again." });
  }

  const userId = linkData.user?.id;

  // Check if this user already has a profile
  const { data: existingProfile } = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  return respond(200, {
    ok: true,
    token: rawToken,
    email,
    isNewUser: !existingProfile,
  });
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
