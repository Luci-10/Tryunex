// Authorization tests for the private-image endpoint.
//
// Signing is pure crypto with no network call, so dummy R2 credentials are
// enough to exercise the whole path. What is under test is who gets a URL —
// not whether R2 serves it.
process.env.R2_ACCOUNT_ID ??= "verify-account";
process.env.R2_ACCESS_KEY_ID ??= "verify-key";
process.env.R2_SECRET_ACCESS_KEY ??= "verify-secret";
process.env.R2_BUCKET ??= "verify-bucket";
process.env.R2_PUBLIC_BASE_URL ??= "https://cdn.verify.invalid";

import { neon } from "@neondatabase/serverless";
import { createApp } from "../dist/app.js";
import { signSessionToken } from "../dist/services/auth.js";

const sql = neon(process.env.DATABASE_URL);
const BASE_URL = process.env.R2_PUBLIC_BASE_URL;
let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${name} — ${detail}`); }
};

async function main() {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  const made = [];

  const mkUser = async (label) => {
    const [u] = await sql`
      INSERT INTO users (email, name)
      VALUES (${`__verify_media_${label}_${Date.now()}@example.invalid`}, ${`Verify ${label}`})
      RETURNING id`;
    made.push(u.id);
    return { id: u.id, cookie: `tryunex_session=${await signSessionToken(u.id)}` };
  };
  const call = async (user, path) => {
    const r = await fetch(api + path, { headers: { cookie: user.cookie } });
    let body = null;
    try { body = await r.json(); } catch { /* non-JSON */ }
    return { status: r.status, body };
  };

  try {
    const owner = await mkUser("owner");
    const other = await mkUser("other");
    const friend = await mkUser("friend");

    const [cloth] = await sql`
      INSERT INTO clothes (user_id, name, category, image_url, style_tag)
      VALUES (${owner.id}, 'Verify Jacket', 'outerwear',
              ${`${BASE_URL}/clothes/${owner.id}/jacket.jpg`}, 'casual')
      RETURNING id`;
    const [selfie] = await sql`
      INSERT INTO tryon_assets (user_id, type, image_url)
      VALUES (${owner.id}, 'selfie', ${`${BASE_URL}/selfies/${owner.id}/me.jpg`})
      RETURNING id`;
    const [result] = await sql`
      INSERT INTO tryon_assets (user_id, type, image_url)
      VALUES (${owner.id}, 'result', ${`${BASE_URL}/tryons/${owner.id}/look.jpg`})
      RETURNING id`;

    console.log("— owner access —");
    const own = await call(owner, `/media/cloth/${cloth.id}`);
    check("owner gets a signed URL for their cloth", own.status === 200 && Boolean(own.body?.url), `status ${own.status}`);
    check("URL is signed and time-boxed",
      /X-Amz-Signature=/.test(own.body?.url ?? "") && /X-Amz-Expires=\d+/.test(own.body?.url ?? ""));
    check("expiry is 10 minutes or less", (own.body?.expiresIn ?? 1e9) <= 600, `${own.body?.expiresIn}s`);
    // The bucket name is inherently part of an S3 presigned path, so that
    // cannot be asserted away. What must not leak is the permanent public URL
    // or a raw key the caller could replay against another record.
    check("response body carries only url and expiresIn",
      JSON.stringify(Object.keys(own.body ?? {}).sort()) === '["expiresIn","url"]',
      JSON.stringify(Object.keys(own.body ?? {})));
    check("response does not contain the permanent public base URL",
      !JSON.stringify(own.body).includes(BASE_URL));
    check("owner gets their selfie", (await call(owner, `/media/selfie/${selfie.id}`)).status === 200);
    check("owner gets their try-on result", (await call(owner, `/media/tryon/${result.id}`)).status === 200);

    console.log("\n— another user is refused —");
    check("stranger cannot get the cloth", (await call(other, `/media/cloth/${cloth.id}`)).status === 403);
    check("stranger cannot get the selfie", (await call(other, `/media/selfie/${selfie.id}`)).status === 403);
    check("stranger cannot get the try-on result", (await call(other, `/media/tryon/${result.id}`)).status === 403);

    const anon = await fetch(`${api}/media/cloth/${cloth.id}`);
    check("signed-out request is rejected", anon.status === 401, `status ${anon.status}`);

    console.log("\n— sharing —");
    await sql`INSERT INTO shares (owner_id, viewer_id, permission, allow_tryon)
              VALUES (${owner.id}, ${friend.id}, 'view', false)`;
    check("a friend the wardrobe is shared with can view a cloth",
      (await call(friend, `/media/cloth/${cloth.id}`)).status === 200);
    check("sharing a wardrobe does NOT expose the owner's selfie",
      (await call(friend, `/media/selfie/${selfie.id}`)).status === 403);
    check("sharing a wardrobe does NOT expose try-on results",
      (await call(friend, `/media/tryon/${result.id}`)).status === 403);

    console.log("\n— thrift —");
    const [listing] = await sql`
      INSERT INTO thrift_listings
        (seller_user_id, source_cloth_id, title, price_paise, size, condition,
         delivery_preference, status, image_url, category)
      VALUES (${owner.id}, ${cloth.id}, 'Verify Jacket', 49900, 'M', 'gently_used',
              'either', 'active', ${`${BASE_URL}/clothes/${owner.id}/jacket.jpg`}, 'outerwear')
      RETURNING id`;
    check("an active listing image is visible to a marketplace visitor",
      (await call(other, `/media/listing/${listing.id}`)).status === 200);
    check("listing it also makes that cloth readable, as try-on already allows",
      (await call(other, `/media/cloth/${cloth.id}`)).status === 200);

    await sql`UPDATE thrift_listings SET status = 'paused' WHERE id = ${listing.id}`;
    check("a paused listing is no longer visible to others",
      (await call(other, `/media/listing/${listing.id}`)).status === 404);
    check("pausing withdraws the cloth exception too",
      (await call(other, `/media/cloth/${cloth.id}`)).status === 403);
    check("the seller can still see their own paused listing",
      (await call(owner, `/media/listing/${listing.id}`)).status === 200);

    await sql`UPDATE thrift_listings SET status = 'active' WHERE id = ${listing.id}`;
    await sql`INSERT INTO thrift_blocks (blocker_user_id, blocked_user_id)
              VALUES (${other.id}, ${owner.id})`;
    check("a blocked pair cannot see each other's listing images",
      (await call(other, `/media/listing/${listing.id}`)).status === 404);

    console.log("\n— input validation —");
    check("a non-uuid id is rejected", (await call(owner, "/media/cloth/not-a-uuid")).status === 400);
    check("an unknown scope is rejected", (await call(owner, `/media/secrets/${cloth.id}`)).status === 400);
    check("a missing record is 404",
      (await call(owner, "/media/cloth/00000000-0000-0000-0000-000000000000")).status === 404);
    check("a selfie id cannot be read through the tryon scope",
      (await call(owner, `/media/tryon/${selfie.id}`)).status === 404);
  } finally {
    for (const id of made) await sql`DELETE FROM users WHERE id = ${id}`;
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
