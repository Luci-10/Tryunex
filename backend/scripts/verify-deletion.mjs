// Account deletion: does it destroy exactly the right things and nothing more?
//
// Deletion is irreversible, so the interesting cases are the ones where it
// could reach too far. The two that matter most:
//
//   - a garment sold on Thrift leaves the buyer holding a row that points at
//     the seller's original image object. Deleting the seller must not take
//     the buyer's picture with it.
//   - payment history is not ours to erase on request; it has to survive in
//     pseudonymous form once the identifiable rows are gone.
//
// Real objects are written to R2 and their existence checked afterwards, so
// these are claims about storage rather than about our intent toward it.
import { neon } from "@neondatabase/serverless";
import { createApp } from "../dist/app.js";
import { signSessionToken } from "../dist/services/auth.js";
import { accountRef } from "../dist/services/accountDeletion.js";
import { presignPut, presignGet, r2PublicBase, deleteObject } from "../dist/services/r2.js";

const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  ok   ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL ${n} — ${d}`); } };

// A real object in the bucket, under an obviously disposable prefix.
async function putObject(key) {
  const { uploadUrl, publicUrl } = await presignPut(key, "image/jpeg");
  const r = await fetch(uploadUrl, {
    method: "PUT", headers: { "content-type": "image/jpeg" }, body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  if (!r.ok) throw new Error(`PUT failed ${r.status}: ${await r.text()}`);
  return publicUrl;
}
async function objectExists(key) {
  const r = await fetch(presignGet(key), { method: "GET" });
  return r.status === 200;
}

async function main() {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  const made = []; const keys = [];
  const mkUser = async (l) => {
    const [u] = await sql`INSERT INTO users (email,name) VALUES (${`__vd_${l}_${Date.now()}_${Math.random()}@example.invalid`},${l}) RETURNING id`;
    made.push(u.id); return { id: u.id, cookie: `tryunex_session=${await signSessionToken(u.id)}`, jar: {} };
  };
  // Minimal cookie jar, so the OTP cookie set by /start reaches /confirm.
  const call = async (u, p, m = "GET", b) => {
    const cookies = [u.cookie, ...Object.entries(u.jar).map(([k, v]) => `${k}=${v}`)].join("; ");
    const r = await fetch(api + p, { method: m, headers: { cookie: cookies, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined });
    for (const sc of (r.headers.getSetCookie?.() ?? [])) {
      const [pair] = sc.split(";"); const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (v === "" ) delete u.jar[k]; else u.jar[k] = v;
    }
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j };
  };
  // The plaintext code never leaves the mailer, so tests mint their own cookie
  // through the same code path the route uses.
  const { generateOtp, issueOtpCookie } = await import("../dist/services/otp.js");
  const issueCode = async (u, email, purpose) => {
    const otp = generateOtp();
    const captured = {};
    await issueOtpCookie({ cookie: (k, v) => { captured[k] = v; } }, email, otp, purpose);
    Object.assign(u.jar, captured);
    return otp;
  };

  try {
    const seller = await mkUser("seller");
    const buyer = await mkUser("buyer");
    const bystander = await mkUser("bystander");
    const [sellerRow] = await sql`SELECT email FROM users WHERE id = ${seller.id}`;

    // Two objects: one only the seller uses, one the buyer will come to share.
    const soleKey = `__deletion_test/${seller.id}/sole.jpg`;
    const sharedKey = `__deletion_test/${seller.id}/shared.jpg`;
    keys.push(soleKey, sharedKey);
    const soleUrl = await putObject(soleKey);
    const sharedUrl = await putObject(sharedKey);

    const [sole] = await sql`INSERT INTO clothes (user_id,name,category,image_url) VALUES (${seller.id},'Sole','top',${soleUrl}) RETURNING id`;
    await sql`INSERT INTO clothes (user_id,name,category,image_url) VALUES (${seller.id},'Shared','top',${sharedUrl})`;
    // The buyer's copy, as a completed sale would leave it.
    await sql`INSERT INTO clothes (user_id,name,category,image_url) VALUES (${buyer.id},'Bought','top',${sharedUrl})`;
    await sql`INSERT INTO tryon_assets (user_id,type,image_url) VALUES (${seller.id},'selfie',${soleUrl})`;
    await sql`INSERT INTO wear_events (cloth_id,user_id,worn_on,settled) VALUES (${sole.id},${seller.id},CURRENT_DATE,true)`;
    await sql`INSERT INTO payments (user_id,product_code,kind,amount_paise,razorpay_payment_id,razorpay_order_id,status)
              VALUES (${seller.id},'pack_10','pack',19900,${'pay_' + Date.now()},${'ord_' + Date.now()},'paid')`;
    await sql`INSERT INTO payments (user_id,product_code,kind,amount_paise,razorpay_order_id,status)
              VALUES (${seller.id},'pack_10','pack',19900,${'ord_abandoned_' + Date.now()},'created')`;

    console.log("— preview —");
    const pv = await call(seller, "/account/deletion-preview");
    check("preview is reachable", pv.status === 200, `status ${pv.status}`);
    check("counts the wardrobe", pv.body?.clothes === 2, JSON.stringify(pv.body?.clothes));
    check("counts try-on images", pv.body?.tryonImages === 1);
    check("counts payments", pv.body?.payments === 2);

    console.log("\n— authorisation —");
    const anon = await fetch(api + "/account/delete/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ otp: "123456" }) });
    check("signed-out cannot delete", anon.status === 401, `status ${anon.status}`);
    const noCode = await call(seller, "/account/delete/confirm", "POST", { otp: "123456" });
    check("a code is required", noCode.status === 400 && /No code|Incorrect/.test(noCode.body?.error ?? ""), JSON.stringify(noCode.body));
    const stillThere = await sql`SELECT 1 FROM users WHERE id = ${seller.id}`;
    check("a failed attempt deletes nothing", stillThere.length === 1);

    // Requesting a code is as guarded as spending one. The mail itself is
    // alarming by design, so an unauthenticated caller must not be able to
    // trigger it at someone else's address.
    const anonStart = await fetch(api + "/account/delete/start", { method: "POST" });
    check("signed-out cannot request a code", anonStart.status === 401, `status ${anonStart.status}`);

    console.log("\n— a sign-in code cannot authorise deletion —");
    const signinCode = await issueCode(seller, sellerRow.email, "signin");
    const misuse = await call(seller, "/account/delete/confirm", "POST", { otp: signinCode });
    check("sign-in code is refused", misuse.status === 400, JSON.stringify(misuse.body));
    check("account survives the misuse", (await sql`SELECT 1 FROM users WHERE id = ${seller.id}`).length === 1);

    console.log("\n— wrong code —");
    await issueCode(seller, sellerRow.email, "delete_account");
    const wrong = await call(seller, "/account/delete/confirm", "POST", { otp: "000000" });
    check("wrong code is refused", wrong.status === 400);
    check("account survives a wrong code", (await sql`SELECT 1 FROM users WHERE id = ${seller.id}`).length === 1);

    console.log("\n— deleting —");
    const code = await issueCode(seller, sellerRow.email, "delete_account");
    const done = await call(seller, "/account/delete/confirm", "POST", { otp: code });
    check("the correct code deletes", done.status === 200, JSON.stringify(done.body));
    check("the user row is gone", (await sql`SELECT 1 FROM users WHERE id = ${seller.id}`).length === 0);
    check("their wardrobe is gone", (await sql`SELECT 1 FROM clothes WHERE user_id = ${seller.id}`).length === 0);
    check("their try-on images are gone", (await sql`SELECT 1 FROM tryon_assets WHERE user_id = ${seller.id}`).length === 0);
    check("their wear history is gone", (await sql`SELECT 1 FROM wear_events WHERE user_id = ${seller.id}`).length === 0);
    check("the session cookie is cleared", /tryunex_session=;|tryunex_session=$/.test(JSON.stringify(seller.jar)) || !seller.jar.tryunex_session);

    console.log("\n— storage —");
    check("the sole-owned object is deleted", (await objectExists(soleKey)) === false);
    check("the shared object survives", (await objectExists(sharedKey)) === true);
    check("reports what it removed", done.body?.imagesDeleted === 1, JSON.stringify(done.body));
    check("reports what it kept", done.body?.imagesKeptShared === 1, JSON.stringify(done.body));

    console.log("\n— the buyer is untouched —");
    const buyerClothes = await sql`SELECT image_url FROM clothes WHERE user_id = ${buyer.id}`;
    check("still owns the bought garment", buyerClothes.length === 1);
    check("and it still points at a live image", buyerClothes[0]?.image_url === sharedUrl);
    check("bystander is unaffected", (await sql`SELECT 1 FROM users WHERE id = ${bystander.id}`).length === 1);

    console.log("\n— financial records —");
    const ref = accountRef(seller.id);
    const kept = await sql`SELECT * FROM retained_financial_records WHERE account_ref = ${ref}`;
    check("the settled payment is retained", kept.length === 1, `${kept.length} rows`);
    check("with its amount", Number(kept[0]?.amount_paise) === 19900);
    check("with the provider's id", String(kept[0]?.provider_payment_id ?? "").startsWith("pay_"));
    check("an abandoned checkout is not retained", kept.every((k) => k.status !== "created"));
    check("no user id is stored", !JSON.stringify(kept[0] ?? {}).includes(seller.id));
    check("no email is stored", !JSON.stringify(kept[0] ?? {}).includes(sellerRow.email));
    check("the identifiable payments are gone", (await sql`SELECT 1 FROM payments WHERE user_id = ${seller.id}`).length === 0);

    console.log("\n— the email is free again —");
    const reuse = await sql`SELECT 1 FROM users WHERE email = ${sellerRow.email}`;
    check("the address can be signed up again", reuse.length === 0);
  } finally {
    for (const id of made) await sql`DELETE FROM users WHERE id = ${id}`;
    for (const k of keys) { try { await deleteObject(k); } catch {} }
    // The table may not exist yet if the run failed before the first deletion.
    try { await sql`DELETE FROM retained_financial_records WHERE reason = 'account_deleted' AND archived_at > now() - interval '10 minutes'`; } catch {}
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
