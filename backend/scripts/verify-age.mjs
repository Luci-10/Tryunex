// DOB + minimum-age registration behaviour. Unchanged by the policy work.
import { neon } from "@neondatabase/serverless";
import { createApp } from "../dist/app.js";
import { signPendingToken } from "../dist/services/auth.js";
import { MINIMUM_AGE, ageOn, checkAge } from "../dist/services/age.js";

const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0; const failures = [];
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  ok   ${n}`); } else { fail++; failures.push(n); console.log(`  FAIL ${n} — ${d}`); } };
const iso = (d) => d.toISOString().slice(0, 10);
const yearsAgo = (y, offsetDays = 0) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); d.setUTCDate(d.getUTCDate() + offsetDays); return iso(d); };

async function main() {
  console.log(`minimum age is ${MINIMUM_AGE}\n— age maths —`);
  check("exact birthday counts as that age", ageOn(yearsAgo(MINIMUM_AGE)) === MINIMUM_AGE);
  check("one day before the birthday is a year younger", ageOn(yearsAgo(MINIMUM_AGE, 1)) === MINIMUM_AGE - 1);
  check("comfortably older passes", checkAge(yearsAgo(MINIMUM_AGE + 10)).ok === true);
  check("exactly at the minimum passes", checkAge(yearsAgo(MINIMUM_AGE)).ok === true);
  check("one day short is refused", checkAge(yearsAgo(MINIMUM_AGE, 1)).ok === false);
  check("a future date is refused", checkAge(yearsAgo(-5)).ok === false);
  check("nonsense is refused", checkAge("not-a-date").ok === false);

  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  const emails = [];
  const complete = async (email, body) => {
    const token = await signPendingToken(email);
    const r = await fetch(`${api}/auth/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `tryunex_pending=${token}` },
      body: JSON.stringify(body),
    });
    let b = null; try { b = await r.json(); } catch {}
    return { status: r.status, body: b };
  };

  try {
    console.log("\n— registration —");
    const cfg = await (await fetch(`${api}/config`)).json();
    check("minimum age is published for the form", cfg.minimumAge === MINIMUM_AGE);

    const young = `__verify_age_young_${Date.now()}@example.invalid`; emails.push(young);
    const tooYoung = await complete(young, { name: "Too Young", dob: yearsAgo(MINIMUM_AGE, 1) });
    check("an underage signup is refused", tooYoung.status === 400 && tooYoung.body?.code === "AGE_RESTRICTED", `status ${tooYoung.status}`);
    check("and no account is created", (await sql`SELECT 1 FROM users WHERE email = ${young}`).length === 0);

    const missing = `__verify_age_missing_${Date.now()}@example.invalid`; emails.push(missing);
    check("a missing date of birth is refused", (await complete(missing, { name: "No Dob" })).status === 400);
    check("and no account is created", (await sql`SELECT 1 FROM users WHERE email = ${missing}`).length === 0);

    const ok = `__verify_age_ok_${Date.now()}@example.invalid`; emails.push(ok);
    const good = await complete(ok, { name: "Old Enough", dob: yearsAgo(MINIMUM_AGE + 3) });
    check("an eligible signup succeeds", good.status === 200 && Boolean(good.body?.user?.id), `status ${good.status}`);
    const row = await sql`SELECT dob FROM users WHERE email = ${ok}`;
    check("date of birth is stored", row.length === 1 && Boolean(row[0].dob));
  } finally {
    for (const e of emails) await sql`DELETE FROM users WHERE email = ${e}`;
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
