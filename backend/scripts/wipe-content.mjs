// Deletes all user CONTENT. Keeps accounts, credits, payments and consent.
//
//   node --env-file=.env scripts/wipe-content.mjs              <- dry run
//   node --env-file=.env scripts/wipe-content.mjs --confirm    <- actually deletes
//
// There is no undo. Read this file before running it with --confirm.
import { neon } from "@neondatabase/serverless";
import { deleteObject, keyFromUrl } from "../dist/services/r2.js";

const CONFIRM = process.argv.includes("--confirm");
const sql = neon(process.env.DATABASE_URL);

// Deleted. Order matters where a table has no cascade.
const WIPE = [
  "thrift_messages",
  "thrift_conversation_reports",
  "thrift_listing_reports",
  "thrift_conversations",
  "thrift_saves",
  "thrift_transfers",
  "thrift_transactions",
  "thrift_listings",
  "thrift_blocks",
  "suggestions",
  "shares",
  "share_codes",
  "wear_events",
  "tryon_requests",
  "tryon_assets",
  "clothes",
];

// Untouched, deliberately.
const KEEP = [
  "users",
  "billing_profiles",
  "credit_ledger",
  "payments",
  "policy_acceptances",
  "onboarding_state",
];

async function count(table) {
  try {
    const r = await sql(`SELECT count(*)::int AS c FROM ${table}`);
    return r[0].c;
  } catch {
    return null; // table not present
  }
}

async function main() {
  console.log(CONFIRM ? "MODE: DELETING\n" : "MODE: dry run — nothing will be changed\n");

  // ---- images -----------------------------------------------------------
  const urls = new Set();
  for (const t of ["clothes", "tryon_assets", "thrift_listings"]) {
    try {
      for (const r of await sql(`SELECT image_url AS u FROM ${t}`)) if (r.u) urls.add(r.u);
    } catch { /* table not present */ }
  }
  console.log(`R2 objects referenced: ${urls.size}`);

  if (CONFIRM) {
    let ok = 0, unknown = 0, failed = 0;
    for (const u of urls) {
      const key = keyFromUrl(u);
      if (!key) { unknown++; continue; }
      try { await deleteObject(key); ok++; }
      catch (e) { failed++; console.error("  delete failed:", String(e.message ?? e).slice(0, 80)); }
    }
    console.log(`  deleted ${ok} · unrecognised ${unknown} · failed ${failed}\n`);
  } else {
    console.log("  (dry run — none deleted)\n");
  }

  // ---- database ---------------------------------------------------------
  console.log("tables to wipe:");
  let total = 0;
  for (const t of WIPE) {
    const before = await count(t);
    if (before === null) { console.log(`  ${t.padEnd(30)} (not present)`); continue; }
    total += before;
    if (CONFIRM) {
      await sql(`DELETE FROM ${t}`);
      console.log(`  ${t.padEnd(30)} ${String(before).padStart(5)} -> ${await count(t)}`);
    } else {
      console.log(`  ${t.padEnd(30)} ${String(before).padStart(5)} rows would be deleted`);
    }
  }
  console.log(`\n  ${total} content rows in total`);

  console.log("\npreserved:");
  for (const t of KEEP) {
    const c = await count(t);
    console.log(`  ${t.padEnd(30)} ${c === null ? "(not present)" : `${c} rows kept`}`);
  }

  console.log(
    CONFIRM
      ? "\nDone. Your R2 bucket should now be empty — a good moment to switch off the public r2.dev binding in Cloudflare."
      : "\nNothing was changed. Re-run with --confirm to delete.",
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
