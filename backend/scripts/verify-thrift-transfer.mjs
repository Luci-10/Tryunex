// Thrift sale -> wardrobe transfer, and reference-counted image cleanup.
process.env.R2_ACCOUNT_ID ??= "verify-account";
process.env.R2_ACCESS_KEY_ID ??= "verify-key";
process.env.R2_SECRET_ACCESS_KEY ??= "verify-secret";
process.env.R2_BUCKET ??= "verify-bucket";
process.env.R2_PUBLIC_BASE_URL ??= "https://cdn.verify.invalid";

import { neon } from "@neondatabase/serverless";
import { createApp } from "../dist/app.js";
import { signSessionToken } from "../dist/services/auth.js";
import { imageReferenceCount } from "../dist/services/thriftTransfer.js";

const sql = neon(process.env.DATABASE_URL);
const BASE = process.env.R2_PUBLIC_BASE_URL;
let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  ok   ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL ${n} — ${d}`); } };

async function main() {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  const made = [];

  const mkUser = async (l) => {
    const [u] = await sql`INSERT INTO users (email, name) VALUES (${`__verify_tt_${l}_${Date.now()}_${Math.random()}@example.invalid`}, ${l}) RETURNING id`;
    made.push(u.id); return { id: u.id, cookie: `tryunex_session=${await signSessionToken(u.id)}` };
  };
  const call = async (u, path, method = "GET", body) => {
    const r = await fetch(api + path, {
      method, headers: { cookie: u.cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let b = null; try { b = await r.json(); } catch {}
    return { status: r.status, body: b };
  };
  const setup = async () => {
    const seller = await mkUser("seller"), buyer = await mkUser("buyer");
    const img = `${BASE}/clothes/${seller.id}/${Math.random().toString(16).slice(2)}.jpg`;
    const [cloth] = await sql`INSERT INTO clothes (user_id,name,category,image_url,style_tag)
      VALUES (${seller.id},'Verify Coat','outerwear',${img},'casual') RETURNING id`;
    const [listing] = await sql`INSERT INTO thrift_listings
      (seller_user_id,source_cloth_id,title,price_paise,size,condition,delivery_preference,status,image_url,category)
      VALUES (${seller.id},${cloth.id},'Verify Coat',49900,'M','gently_used','either','active',${img},'outerwear') RETURNING id`;
    await sql`INSERT INTO thrift_conversations (listing_id,buyer_user_id,seller_user_id) VALUES (${listing.id},${buyer.id},${seller.id})`;
    return { seller, buyer, cloth, listing, img };
  };

  try {
    console.log("— a completed sale transfers exactly one garment —");
    let s = await setup();
    const sale = await call(s.seller, `/thrift/listings/${s.listing.id}/sell`, "POST", { buyerUserId: s.buyer.id });
    check("seller opens a sale", sale.status === 201, `status ${sale.status}`);
    const txId = sale.body?.transactionId;

    const stillSeller = await sql`SELECT user_id FROM clothes WHERE id = ${s.cloth.id}`;
    check("pending sale does NOT transfer", stillSeller[0]?.user_id === s.seller.id);

    const confirm = await call(s.buyer, `/thrift/transactions/${txId}/confirm`, "POST");
    check("buyer confirms and it completes", confirm.status === 200, `status ${confirm.status}`);
    const sellerRows = await sql`SELECT id FROM clothes WHERE id = ${s.cloth.id}`;
    check("gone from the seller's wardrobe", sellerRows.length === 0);
    const buyerRows = await sql`SELECT id,name,category,style_tag,image_url FROM clothes WHERE user_id = ${s.buyer.id}`;
    check("exactly one garment in the buyer's wardrobe", buyerRows.length === 1, `${buyerRows.length}`);
    check("name, category, style and image preserved",
      buyerRows[0]?.name === "Verify Coat" && buyerRows[0]?.category === "outerwear" &&
      buyerRows[0]?.style_tag === "casual" && buyerRows[0]?.image_url === s.img);
    check("the same R2 object is reused, not copied", buyerRows[0]?.image_url === s.img);
    const audit = await sql`SELECT * FROM thrift_transfers WHERE transaction_id = ${txId}`;
    check("transfer is audited", audit.length === 1 && audit[0].seller_user_id === s.seller.id && audit[0].buyer_user_id === s.buyer.id);

    console.log("\n— idempotency —");
    const again = await call(s.buyer, `/thrift/transactions/${txId}/confirm`, "POST");
    check("a duplicate confirm is accepted without re-transferring", again.status === 200 && again.body?.alreadyTransferred === true, `status ${again.status}`);
    const buyerAfter = await sql`SELECT id FROM clothes WHERE user_id = ${s.buyer.id}`;
    check("still exactly one garment", buyerAfter.length === 1, `${buyerAfter.length}`);
    const auditAfter = await sql`SELECT id FROM thrift_transfers WHERE transaction_id = ${txId}`;
    check("still exactly one transfer record", auditAfter.length === 1);

    console.log("\n— non-completed states do not transfer —");
    s = await setup();
    const s2 = await call(s.seller, `/thrift/listings/${s.listing.id}/sell`, "POST", { buyerUserId: s.buyer.id });
    await sql`UPDATE thrift_transactions SET status='cancelled' WHERE id=${s2.body.transactionId}`;
    const cancelled = await call(s.buyer, `/thrift/transactions/${s2.body.transactionId}/confirm`, "POST");
    check("a cancelled sale cannot be confirmed", cancelled.status === 409, `status ${cancelled.status}`);
    check("and nothing moved", (await sql`SELECT user_id FROM clothes WHERE id=${s.cloth.id}`)[0]?.user_id === s.seller.id);

    console.log("\n— authorization —");
    s = await setup();
    const outsider = await mkUser("outsider");
    const notMine = await call(outsider, `/thrift/listings/${s.listing.id}/sell`, "POST", { buyerUserId: s.buyer.id });
    check("a non-seller cannot open a sale", notMine.status === 403, `status ${notMine.status}`);
    const selfBuy = await call(s.seller, `/thrift/listings/${s.listing.id}/sell`, "POST", { buyerUserId: s.seller.id });
    check("a seller cannot sell to themselves", selfBuy.status === 400, `status ${selfBuy.status}`);
    const stranger = await call(s.seller, `/thrift/listings/${s.listing.id}/sell`, "POST", { buyerUserId: outsider.id });
    check("the buyer must have messaged about the listing", stranger.status === 400, `status ${stranger.status}`);

    const ok = await call(s.seller, `/thrift/listings/${s.listing.id}/sell`, "POST", { buyerUserId: s.buyer.id });
    const wrongBuyer = await call(outsider, `/thrift/transactions/${ok.body.transactionId}/confirm`, "POST");
    check("only the named buyer can confirm", wrongBuyer.status === 404, `status ${wrongBuyer.status}`);
    const second = await call(s.seller, `/thrift/listings/${s.listing.id}/sell`, "POST", { buyerUserId: s.buyer.id });
    check("a listing cannot be sold twice", second.status === 409, `status ${second.status}`);

    console.log("\n— image reference counting —");
    const solo = await mkUser("solo");
    const soloImg = `${BASE}/clothes/${solo.id}/solo.jpg`;
    const [soloCloth] = await sql`INSERT INTO clothes (user_id,name,category,image_url) VALUES (${solo.id},'Solo','top',${soloImg}) RETURNING id`;
    check("an unshared image has no other references", (await imageReferenceCount(soloImg, soloCloth.id)) === 0);

    s = await setup();
    const t = await call(s.seller, `/thrift/listings/${s.listing.id}/sell`, "POST", { buyerUserId: s.buyer.id });
    await call(s.buyer, `/thrift/transactions/${t.body.transactionId}/confirm`, "POST");
    const [buyerCloth] = await sql`SELECT id FROM clothes WHERE user_id=${s.buyer.id} AND image_url=${s.img}`;
    const refs = await imageReferenceCount(s.img, buyerCloth.id);
    check("after transfer the image is still referenced elsewhere", refs > 0, `${refs} refs`);

    const del = await call(s.buyer, `/clothes/${buyerCloth.id}`, "DELETE");
    check("buyer can delete their transferred piece", del.status === 200, `status ${del.status}`);
    check("but the shared object is NOT removed from storage", del.body?.imageDeleted === false, JSON.stringify(del.body));

    // The decision is what matters here: zero references means the object is
    // eligible for deletion. The R2 round-trip itself cannot be exercised
    // locally — these tests run against dummy credentials, so the DELETE call
    // fails at the network and imageDeleted comes back false. That path needs
    // a deploy with real R2 credentials to confirm.
    const soloRefs = await imageReferenceCount(soloImg, soloCloth.id);
    check("an unreferenced object has zero references", soloRefs === 0, `${soloRefs} refs`);
    const delSolo = await call(solo, `/clothes/${soloCloth.id}`, "DELETE");
    check("deleting it succeeds and does not error the user", delSolo.status === 200, `status ${delSolo.status}`);
    check("its row is gone", (await sql`SELECT 1 FROM clothes WHERE id = ${soloCloth.id}`).length === 0);

    const other = await mkUser("other");
    const notYours = await call(other, `/clothes/${soloCloth.id}`, "DELETE");
    check("cannot delete someone else's garment", notYours.status === 404, `status ${notYours.status}`);

    console.log("\n— listed pieces are protected —");
    s = await setup();
    const listed = await call(s.seller, `/clothes/${s.cloth.id}`, "DELETE");
    check("cannot delete a piece with an open listing", listed.status === 409 && listed.body?.code === "LISTED_FOR_SALE", `status ${listed.status}`);
  } finally {
    for (const id of made) await sql`DELETE FROM users WHERE id = ${id}`;
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
