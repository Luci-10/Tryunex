// READ-ONLY audit of image storage. Writes nothing, deletes nothing.
//
// This is the dry-run report that has to come before any migration: it counts
// what is stored, what shape it is in, and what the migration would touch.
// Run it, read it, and only then decide.
//
//   npm run audit:images
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const BASE = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

/** Never print a full image URL — it is a live credential while the bucket is public. */
function shape(url) {
  if (!url) return "empty";
  if (!/^https?:\/\//i.test(url)) return "bare-key";
  if (BASE && url.startsWith(BASE + "/")) return "public-url";
  return "foreign-url";
}

function tally(rows, field = "image_url") {
  const out = { total: rows.length, "public-url": 0, "bare-key": 0, "foreign-url": 0, empty: 0 };
  for (const r of rows) out[shape(r[field])] += 1;
  return out;
}

async function main() {
  console.log("TryUnex image storage audit — READ ONLY, nothing is modified\n");
  console.log(`public base configured: ${BASE ? "yes" : "NO (R2_PUBLIC_BASE_URL unset)"}\n`);

  const clothes = await sql`SELECT id, user_id, image_url FROM clothes`;
  const selfies = await sql`SELECT id, user_id, image_url FROM tryon_assets WHERE type = 'selfie'`;
  const results = await sql`SELECT id, user_id, image_url FROM tryon_assets WHERE type = 'result'`;

  let listings = [];
  try {
    listings = await sql`SELECT id, seller_user_id, source_cloth_id, status, image_url FROM thrift_listings`;
  } catch {
    console.log("thrift_listings not present yet — skipping\n");
  }

  const groups = [
    ["wardrobe images (clothes)", clothes],
    ["selfies (tryon_assets type=selfie)", selfies],
    ["generated results (tryon_assets type=result)", results],
    ["thrift listing images", listings],
  ];

  for (const [label, rows] of groups) {
    const t = tally(rows);
    console.log(`${label}`);
    console.log(`  rows            ${t.total}`);
    console.log(`  public URLs     ${t["public-url"]}   <- would be migrated to private keys`);
    console.log(`  already keys    ${t["bare-key"]}`);
    console.log(`  foreign/other   ${t["foreign-url"]}`);
    console.log(`  empty           ${t.empty}`);
    console.log("");
  }

  // Listings whose image is the same object as the wardrobe original. These
  // need a separate public derivative before the original can go private,
  // otherwise making the bucket private takes the marketplace card with it.
  const activeShared = listings.filter(
    (l) => ["active"].includes(l.status) && clothes.some((c) => c.id === l.source_cloth_id && c.image_url === l.image_url),
  );
  console.log("thrift needing a public derivative before cutover");
  console.log(`  active listings sharing the wardrobe object   ${activeShared.length}`);
  console.log("  (each needs a public copy, so the private original can stop being public)\n");

  // Objects referenced by more than one row must not be deleted on the first
  // referencing row going away.
  const counts = new Map();
  for (const [, rows] of groups) for (const r of rows) {
    if (!r.image_url) continue;
    counts.set(r.image_url, (counts.get(r.image_url) ?? 0) + 1);
  }
  const shared = [...counts.values()].filter((n) => n > 1).length;
  console.log("deletion safety");
  console.log(`  distinct objects referenced          ${counts.size}`);
  console.log(`  objects referenced by 2+ rows        ${shared}   <- must survive a single-row delete`);
  console.log("");

  const totalPublic = groups.reduce((n, [, rows]) => n + tally(rows)["public-url"], 0);
  console.log("summary");
  console.log(`  objects currently reachable without login   ${totalPublic}`);
  console.log(`  migration would rewrite                     ${totalPublic} row(s)`);
  console.log("\nNo changes were made. This report is safe to re-run at any time.");
}

main().catch((e) => { console.error(e); process.exit(1); });
