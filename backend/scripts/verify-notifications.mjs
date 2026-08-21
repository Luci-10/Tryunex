import { neon } from "@neondatabase/serverless";
import { createApp } from "../dist/app.js";
import { signSessionToken } from "../dist/services/auth.js";
import { notify } from "../dist/services/notifications.js";

const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  ok   ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL ${n} — ${d}`); } };

async function main() {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  const made = [];
  const mkUser = async (l) => {
    const [u] = await sql`INSERT INTO users (email,name) VALUES (${`__vn_${l}_${Date.now()}_${Math.random()}@example.invalid`},${l}) RETURNING id`;
    made.push(u.id); return { id: u.id, cookie: `tryunex_session=${await signSessionToken(u.id)}` };
  };
  const call = async (u, p, m = "GET", b) => {
    const r = await fetch(api + p, { method: m, headers: { cookie: u.cookie, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j };
  };

  try {
    const a = await mkUser("a"), b = await mkUser("b");

    console.log("— empty state —");
    const empty = await call(a, "/notifications");
    check("feed is reachable", empty.status === 200);
    check("starts empty", empty.body?.notifications?.length === 0 && empty.body?.unread === 0);

    console.log("\n— recording —");
    await notify({ userId: a.id, kind: "thrift_message", title: "New message", body: "hello", link: "/thrift/messages/x", dedupeKey: `t1:${a.id}` });
    const one = await call(a, "/notifications");
    check("appears in the feed", one.body?.notifications?.length === 1);
    check("counted as unread", one.body?.unread === 1);
    check("carries its link", one.body?.notifications?.[0]?.link === "/thrift/messages/x");

    console.log("\n— dedupe —");
    for (let i = 0; i < 4; i++) {
      await notify({ userId: a.id, kind: "thrift_message", title: "New message", body: `msg ${i}`, dedupeKey: `t1:${a.id}` });
    }
    const dedup = await call(a, "/notifications");
    check("repeats collapse into one row", dedup.body?.notifications?.length === 1, `${dedup.body?.notifications?.length}`);
    check("newest body wins", dedup.body?.notifications?.[0]?.body === "msg 3");

    console.log("\n— isolation —");
    const other = await call(b, "/notifications");
    check("another user sees nothing", other.body?.notifications?.length === 0 && other.body?.unread === 0);

    console.log("\n— read state —");
    const id = dedup.body.notifications[0].id;
    const readOne = await call(a, "/notifications/read", "POST", { id });
    check("marking one clears its unread", readOne.body?.unread === 0);
    check("the row is still listed", readOne.body?.notifications?.length === 1);
    check("and shows as read", readOne.body?.notifications?.[0]?.read === true);

    await notify({ userId: a.id, kind: "wardrobe_shared", title: "New viewer", dedupeKey: `t2:${a.id}` });
    await notify({ userId: a.id, kind: "outfit_suggested", title: "A look", dedupeKey: `t3:${a.id}` });
    check("unread counts multiple", (await call(a, "/notifications")).body?.unread === 2);
    check("mark-all clears them", (await call(a, "/notifications/read", "POST", {})).body?.unread === 0);

    console.log("\n— cannot read someone else's —");
    const bId = (await (async () => {
      await notify({ userId: b.id, kind: "thrift_message", title: "For B", dedupeKey: `t4:${b.id}` });
      return (await call(b, "/notifications")).body.notifications[0].id;
    })());
    await call(a, "/notifications/read", "POST", { id: bId });
    check("A marking B's notification does nothing", (await call(b, "/notifications")).body?.unread === 1);

    const anon = await fetch(`${api}/notifications`);
    check("signed-out is rejected", anon.status === 401, `status ${anon.status}`);

    console.log("\n— failure is non-fatal —");
    let threw = false;
    try { await notify({ userId: "not-a-uuid", kind: "thrift_message", title: "x", dedupeKey: `bad:${Date.now()}` }); }
    catch { threw = true; }
    check("a bad write does not throw into the caller", threw === false);
  } finally {
    for (const id of made) await sql`DELETE FROM users WHERE id = ${id}`;
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
