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

  // generateLink creates the Supabase auth user if new, or finds them if existing.
  // We only need this to reliably get the user's UUID.
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "https://tryunex.in" },
  });

  if (linkError || !linkData?.user?.id) {
    console.error("generateLink error:", linkError);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  const userId = linkData.user.id;

  // Set a one-time random password on the user.
  // signInWithPassword is the most reliable Supabase sign-in method — no token
  // format issues. The password is 64 random hex chars, completely unguessable.
  const tempPassword = crypto.randomBytes(32).toString("hex");

  const { error: updateError } = await db.auth.admin.updateUserById(userId, {
    password: tempPassword,
    email_confirm: true,
  });

  if (updateError) {
    console.error("updateUserById error:", updateError);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  // Check whether this user already has a profile
  const { data: existingProfile } = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  return respond(200, {
    ok: true,
    email,
    password: tempPassword,
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
