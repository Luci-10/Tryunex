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

  // Verify our 6-digit OTP
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

  await db.from("otp_tokens").delete().eq("email", email);

  // Generate a Supabase magic link to get the raw OTP token
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "https://tryunex.in" },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error("generateLink error:", linkError);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  // Extract the raw token from the action_link URL
  const rawToken = new URL(linkData.properties.action_link).searchParams.get("token");
  if (!rawToken) {
    console.error("No token in action_link:", linkData.properties.action_link);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  // POST directly to GoTrue's /verify endpoint — returns session JSON, no redirects
  const verifyResult = await httpsPost(
    `${process.env.SUPABASE_URL}/auth/v1/verify`,
    { type: "magiclink", token: rawToken },
    { apikey: process.env.SUPABASE_SERVICE_KEY }
  );

  if (verifyResult.status !== 200 || !verifyResult.data.access_token) {
    console.error("GoTrue verify failed:", verifyResult.status, verifyResult.data);
    return respond(500, { error: "Authentication failed. Try again." });
  }

  const { access_token, refresh_token } = verifyResult.data;
  const userId = linkData.user?.id;

  // Check if this user already has a profile
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

// Makes a POST request using Node's built-in https module (always available in Lambda).
function httpsPost(urlStr, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, data: {} });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
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
