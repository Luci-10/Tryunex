// Credit maths and garment compositing for the FLUX VTO try-on.
// Runs against the real database with a throwaway user, deleted in `finally`.
import { neon } from "@neondatabase/serverless";
import {
  debitCredits,
  creditsForItems,
  refundCredit,
  getBalance,
  grantCredits,
  ensureProfile,
} from "../dist/services/billing/credits.js";
import { buildGarmentSheet, normalisePersonImage } from "../dist/services/garmentSheet.js";
import sharp from "sharp";

const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${name} — ${detail}`); }
};

async function main() {
  console.log("— cost table —");
  for (const [n, want] of [[1,1],[2,1],[3,1],[4,2],[5,2]]) {
    check(`${n} item${n>1?"s":""} costs ${want} credit${want>1?"s":""}`, creditsForItems(n) === want, `got ${creditsForItems(n)}`);
  }

  let userId = null;
  try {
    const [u] = await sql`
      INSERT INTO users (email, name)
      VALUES (${`__verify_vto_${Date.now()}@example.invalid`}, 'Verify VTO') RETURNING id`;
    userId = u.id;
    await ensureProfile(userId);
    await grantCredits({
      userId,
      amount: 5,
      type: "admin_adjustment",
      source: "pack",
      productCode: "verify_seed",
      expiresAt: null,
      idempotencyKey: `seed:${userId}`,
    });

    console.log("\n— atomic debits —");
    const start = await getBalance(userId);
    check("seeded balance", start.total === 5, `got ${start.total}`);

    const two = await debitCredits(userId, "tryon_debit", `k1:${userId}`, 2);
    check("2-credit debit succeeds", two.ok === true);
    check("balance drops by 2", (await getBalance(userId)).total === 3, `got ${(await getBalance(userId)).total}`);

    const replay = await debitCredits(userId, "tryon_debit", `k1:${userId}`, 2);
    check("same key is idempotent", replay.ok === true && replay.alreadyApplied === true);
    check("replay did not double-charge", (await getBalance(userId)).total === 3);

    console.log("\n— concurrency —");
    const race = await Promise.all(
      Array.from({ length: 4 }, (_, i) => debitCredits(userId, "tryon_debit", `race${i}:${userId}`, 2)),
    );
    const ok = race.filter((r) => r.ok).length;
    const bal = await getBalance(userId);
    check("only affordable debits succeed", ok === 1, `${ok} succeeded from a balance of 3`);
    check("balance never goes negative", bal.total >= 0, `got ${bal.total}`);
    check("balance is exactly 1 after one 2-credit debit", bal.total === 1, `got ${bal.total}`);

    console.log("\n— refunds return what was taken —");
    await refundCredit(userId, `k1:${userId}`);
    const after = await getBalance(userId);
    check("2-credit debit refunds 2", after.total === 3, `got ${after.total}`);
    await refundCredit(userId, `k1:${userId}`);
    check("refund is idempotent", (await getBalance(userId)).total === 3);

    console.log("\n— insufficient balance —");
    const broke = await debitCredits(userId, "tryon_debit", `broke:${userId}`, 99);
    check("over-budget debit refused", broke.ok === false && broke.reason === "insufficient");
    check("refusal costs nothing", (await getBalance(userId)).total === 3);
  } finally {
    if (userId) await sql`DELETE FROM users WHERE id = ${userId}`;
  }

  console.log("\n— garment sheet —");
  // Stand-in garments at deliberately awkward aspect ratios.
  const shapes = [[900, 1200], [1400, 900], [800, 800], [600, 1500], [1200, 1200]];
  const urls = [];
  for (const [w, h] of shapes) {
    const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 200, b: 240 } } })
      .jpeg().toBuffer();
    urls.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
  }
  // buildGarmentSheet fetches URLs; data: URIs work through undici's fetch.
  for (const n of [1, 2, 3, 4, 5]) {
    const sheet = await buildGarmentSheet(
      urls.slice(0, n).map((u, i) => ({ imageUrl: u, role: ["top","bottom","outerwear","shoes","accessory"][i] })),
    );
    const mp = (sheet.width * sheet.height) / 1e6;
    check(`${n}-garment sheet is one image under 1MP`, mp <= 1.0, `${sheet.width}x${sheet.height} = ${mp.toFixed(2)}MP`);
    check(`${n}-garment sheet decodes`, (await sharp(sheet.buffer).metadata()).width === sheet.width);
  }

  console.log("\n— person image —");
  const bigPortrait = await sharp({ create: { width: 3024, height: 4032, channels: 3, background: { r: 210, g: 190, b: 170 } } })
    .jpeg().toBuffer();
  const personUrl = `data:image/jpeg;base64,${bigPortrait.toString("base64")}`;
  const person = await normalisePersonImage(personUrl);
  check("12MP portrait lands at 768x1024", person.width === 768 && person.height === 1024, `${person.width}x${person.height}`);
  check("person image stays portrait", person.height > person.width);
  check("person image under 1MP", (person.width * person.height) / 1e6 <= 1.0);

  const small = await sharp({ create: { width: 400, height: 500, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
  const smallOut = await normalisePersonImage(`data:image/jpeg;base64,${small.toString("base64")}`);
  check("small images are never upscaled", smallOut.width === 400 && smallOut.height === 500, `${smallOut.width}x${smallOut.height}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
