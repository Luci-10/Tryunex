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

  // Single-use — delete it immediately
  await db.from("otp_tokens").delete().eq("email", email);

  // Generate a Supabase magic-link token (creates auth user if new, or re-uses existing)
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

  // Create profile + wardrobe for first-time users
  const { data: existingProfile } = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (!existingProfile) {
    const name = (tokenRow.name || "").trim() || email.split("@")[0];

    await db.from("profiles").insert({ id: userId, name, email });

    const shareCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const sunday = new Date();
    sunday.setDate(sunday.getDate() - sunday.getDay());
    sunday.setHours(12, 0, 0, 0);
    const sundayKey = sunday.toISOString().slice(0, 10);

    const { data: closet } = await db
      .from("closets")
      .insert({
        owner_id: userId,
        name: `${name}'s Wardrobe`,
        share_code: shareCode,
        last_laundry_reset: sundayKey,
      })
      .select()
      .single();

    if (closet) {
      await db
        .from("closet_members")
        .insert({ closet_id: closet.id, user_id: userId });
    }
  }

  return respond(200, { ok: true, token: hashedToken, email });
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
