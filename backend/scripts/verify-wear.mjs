// Wear tracking: does the wardrobe remember when something was last worn?
//
// This suite exists because of a specific bug. The "last worn" value was a
// correlated subquery written with Drizzle column helpers, which render
// *unqualified*:
//
//   WHERE "cloth_id" = "id"          -- both resolve inside wear_events
//
// Inside the subquery that bare "id" bound to wear_events.id rather than
// clothes.id, so the condition was "an event whose cloth is itself" — never
// true. Every garment reported "Never worn" no matter how often it was worn.
// It passed type checking and ran without error, which is why it went unseen.
//
// The checks below go through the HTTP API, so they exercise what the web and
// the app actually receive rather than the query in isolation.
import { neon } from "@neondatabase/serverless";
import { createApp } from "../dist/app.js";
import { signSessionToken } from "../dist/services/auth.js";

const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  ok   ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL ${n} — ${d}`); } };

async function main() {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  const made = [];
  const mkUser = async (l) => {
    const [u] = await sql`INSERT INTO users (email,name) VALUES (${`__vw_${l}_${Date.now()}_${Math.random()}@example.invalid`},${l}) RETURNING id`;
    made.push(u.id); return { id: u.id, cookie: `tryunex_session=${await signSessionToken(u.id)}` };
  };
  const call = async (u, p, m = "GET", b) => {
    const r = await fetch(api + p, { method: m, headers: { cookie: u.cookie, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j };
  };
  const mkCloth = async (u, name) => {
    const [c] = await sql`INSERT INTO clothes (user_id,name,category,image_url) VALUES (${u.id},${name},'top','wardrobe/x.jpg') RETURNING id`;
    return c.id;
  };
  const find = async (u, id) => (await call(u, "/clothes")).body?.clothes?.find((c) => c.id === id);
  const today = (await sql`SELECT CURRENT_DATE::text AS d`)[0].d;

  try {
    const a = await mkUser("a"), b = await mkUser("b");
    const shirt = await mkCloth(a, "Shirt");

    console.log("— before it is ever worn —");
    const fresh = await find(a, shirt);
    check("starts with no wear date", fresh?.lastWornOn === null, JSON.stringify(fresh?.lastWornOn));
    check("starts clean", fresh?.status === "clean");

    console.log("\n— wearing it —");
    await call(a, "/clothes/wear", "POST", { ids: [shirt] });
    const worn = await find(a, shirt);
    check("reports today as last worn", worn?.lastWornOn === today, `got ${JSON.stringify(worn?.lastWornOn)}, expected ${today}`);
    check("status becomes worn", worn?.status === "worn");

    console.log("\n— resetting —");
    await call(a, "/clothes/reset", "POST");
    const reset = await find(a, shirt);
    check("reset returns it to clean", reset?.status === "clean");
    check("reset does NOT erase the wear history", reset?.lastWornOn === today, `got ${JSON.stringify(reset?.lastWornOn)}`);

    console.log("\n— marking clean —");
    await call(a, "/clothes/wear", "POST", { ids: [shirt] });
    await call(a, `/clothes/${shirt}/clean`, "POST");
    const cleaned = await find(a, shirt);
    check("clean returns it to clean", cleaned?.status === "clean");
    check("clean keeps the wear history", cleaned?.lastWornOn === today, `got ${JSON.stringify(cleaned?.lastWornOn)}`);

    console.log("\n— the date is the most recent wear —");
    const old = await mkCloth(a, "Jacket");
    await sql`INSERT INTO wear_events (cloth_id,user_id,worn_on,settled) VALUES (${old},${a.id},CURRENT_DATE - 10,true)`;
    await sql`INSERT INTO wear_events (cloth_id,user_id,worn_on,settled) VALUES (${old},${a.id},CURRENT_DATE - 3,true)`;
    const jacket = await find(a, old);
    const expected = (await sql`SELECT (CURRENT_DATE - 3)::text AS d`)[0].d;
    check("returns the latest of several wears", jacket?.lastWornOn === expected, `got ${JSON.stringify(jacket?.lastWornOn)}`);

    console.log("\n— unsettled events are excluded —");
    const pending = await mkCloth(a, "Scarf");
    await sql`INSERT INTO wear_events (cloth_id,user_id,worn_on,settled) VALUES (${pending},${a.id},CURRENT_DATE,false)`;
    const scarf = await find(a, pending);
    check("an unsettled wear does not count", scarf?.lastWornOn === null, `got ${JSON.stringify(scarf?.lastWornOn)}`);

    console.log("\n— the date belongs to its own garment —");
    const untouched = await mkCloth(a, "Hat");
    const hat = await find(a, untouched);
    check("a never-worn item stays null while others are worn", hat?.lastWornOn === null, `got ${JSON.stringify(hat?.lastWornOn)}`);

    console.log("\n— another user's wears do not leak —");
    const theirs = await mkCloth(b, "Theirs");
    await call(b, "/clothes/wear", "POST", { ids: [theirs] });
    const mine = (await call(a, "/clothes")).body?.clothes ?? [];
    check("their garment is absent from my wardrobe", mine.every((c) => c.id !== theirs));
    check("my never-worn items are unaffected", mine.find((c) => c.id === untouched)?.lastWornOn === null);
  } finally {
    for (const id of made) await sql`DELETE FROM users WHERE id = ${id}`;
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
