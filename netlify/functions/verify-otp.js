const https = require("https");
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

  // Generate a Supabase magic link server-side
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "https://tryunex.in" },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error("generateLink error:", linkError);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  // Verify the magic link server-side by calling the action_link URL directly.
  // GoTrue responds with a 302 redirect to tryunex.in#access_token=...&refresh_token=...
  // We read the Location header to extract the session — no browser redirect needed.
  let location;
  try {
    location = await fetchRedirectLocation(linkData.properties.action_link);
  } catch (err) {
    console.error("redirect fetch error:", err);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  if (!location) {
    return respond(500, { error: "Authentication failed. Try again." });
  }

  // Parse access_token and refresh_token from the URL fragment or query string
  const fragment = location.includes("#")
    ? location.split("#")[1]
    : location.includes("?") ? location.split("?")[1] : "";

  const params = new URLSearchParams(fragment);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");

  if (!access_token || !refresh_token) {
    console.error("No session in redirect:", location);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  // Check if this is a new user (no profile row yet)
  const userId = linkData.user?.id;
  const { data: existingProfile } = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  return respond(200, {
    ok: true,
    access_token,
    refresh_token,
    email,
    isNewUser: !existingProfile,
  });
};

// Makes a GET request to the Supabase verify URL without following redirects,
// then returns the Location header value (which contains the session tokens).
function fetchRedirectLocation(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
      },
      (res) => {
        resolve(res.headers["location"] || "");
        res.resume(); // discard body
      }
    );
    req.on("error", reject);
    req.end();
  });
}

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
