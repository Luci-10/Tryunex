// Terms/Privacy acceptance gate, against the real database.
import { neon } from "@neondatabase/serverless";
import { createApp } from "../dist/app.js";
import { signSessionToken } from "../dist/services/auth.js";
import { POLICY_VERSION } from "../dist/services/policy.js";

const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0;
const failures = [];
const check = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`  ok   ${n}`); }
  else { fail++; failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  FAIL ${n} — ${d}`); }
};

async function main() {
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  const made = [];

  const mkUser = async (label) => {
    const [u] = await sql`
      INSERT INTO users (email, name)
      VALUES (${`__verify_policy_${label}_${Date.now()}@example.invalid`}, ${`Verify ${label}`})
      RETURNING id`;
    made.push(u.id);
    return { id: u.id, cookie: `tryunex_session=${await signSessionToken(u.id)}` };
  };
  const call = async (user, path, method = "GET") => {
    const r = await fetch(api + path, { method, headers: { cookie: user.cookie } });
    let body = null;
    try { body = await r.json(); } catch { /* non-JSON */ }
    return { status: r.status, body };
  };

  try {
    const a = await mkUser("a");
    const b = await mkUser("b");

    console.log("— an existing user who has never accepted —");
    const before = await call(a, "/policy/status");
    check("status is reachable", before.status === 200, `status ${before.status}`);
    check("reports not accepted", before.body?.accepted === false);
    check("reports the current version", before.body?.version === POLICY_VERSION, before.body?.version);
    check("no timestamp yet", before.body?.acceptedAt === null);

    console.log("\n— accepting —");
    const acc = await call(a, "/policy/accept", "POST");
    check("accept succeeds", acc.status === 200 && acc.body?.accepted === true);
    check("timestamp is recorded", Boolean(acc.body?.acceptedAt));

    const after = await call(a, "/policy/status");
    check("stays accepted on re-check", after.body?.accepted === true);
    check("so the gate will not show again", after.body?.accepted === true);

    console.log("\n— it is stored, per user —");
    const rows = await sql`
      SELECT user_id, version FROM policy_acceptances WHERE user_id = ${a.id}`;
    check("exactly one row in the database", rows.length === 1, `${rows.length} rows`);
    check("row carries the version", rows[0]?.version === POLICY_VERSION);

    const bStatus = await call(b, "/policy/status");
    check("a different user is unaffected", bStatus.body?.accepted === false);
    const bRows = await sql`SELECT 1 FROM policy_acceptances WHERE user_id = ${b.id}`;
    check("and has no row", bRows.length === 0);

    console.log("\n— double submit —");
    await call(a, "/policy/accept", "POST");
    await call(a, "/policy/accept", "POST");
    const dupe = await sql`SELECT id FROM policy_acceptances WHERE user_id = ${a.id}`;
    check("repeat accepts do not duplicate", dupe.length === 1, `${dupe.length} rows`);

    console.log("\n— auth —");
    const anonStatus = await fetch(`${api}/policy/status`);
    check("signed-out status is rejected", anonStatus.status === 401, `status ${anonStatus.status}`);
    const anonAccept = await fetch(`${api}/policy/accept`, { method: "POST" });
    check("signed-out accept is rejected", anonAccept.status === 401, `status ${anonAccept.status}`);

    console.log("\n— a new version asks again —");
    await sql`UPDATE policy_acceptances SET version = 'older-version' WHERE user_id = ${a.id}`;
    const stale = await call(a, "/policy/status");
    check("an old acceptance does not satisfy the current version", stale.body?.accepted === false);
    const kept = await sql`SELECT version FROM policy_acceptances WHERE user_id = ${a.id}`;
    check("the earlier acceptance is kept as a record", kept.length === 1 && kept[0].version === "older-version");
  } finally {
    for (const id of made) await sql`DELETE FROM users WHERE id = ${id}`;
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
