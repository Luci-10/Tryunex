// Verification suite for the billing system.
//
//   npm run verify:billing        (from backend/, or via the root workspace)
//
// Exercises the credit engine, generation throttles, webhook idempotency and
// signature checks against the real database, plus a live Razorpay order when
// keys are present. Everything it creates it deletes: a temporary user, and a
// test-mode order that costs nothing.
//
// Run against a non-production DATABASE_URL if you have one.
import { neon } from "@neondatabase/serverless";
import { createHmac } from "node:crypto";

const q = neon(process.env.DATABASE_URL);
const credits = await import("../dist/services/billing/credits.js");
const rzp = await import("../dist/services/billing/razorpay.js");
const cat = await import("../dist/services/billing/catalogue.js");

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const yes = (label, got) => eq(label, Boolean(got), true);
const no = (label, got) => eq(label, Boolean(got), false);
const group = (t) => console.log(`\n${t}`);

const [u] = await q`INSERT INTO users (email, name)
  VALUES (${`__verify_${Date.now()}@example.invalid`}, 'Verify') RETURNING id`;
const uid = u.id;

try {
  await credits.ensureBillingSchema();
  await credits.ensureProfile(uid);

  group("Credit grants and expiry");
  // A brand-new account gets the welcome grant; every later month gets the
  // monthly one. Derived from the constants so changing them doesn't rot
  // every number below.
  const WELCOME = credits.WELCOME_CREDITS;
  await credits.grantFreeMonthlyCredit(uid);
  await credits.grantFreeMonthlyCredit(uid);
  eq("new account gets the welcome grant, once", (await credits.getBalance(uid)).total, WELCOME);

  await credits.grantCredits({ userId: uid, amount: 10, type: "pack_purchase_grant",
    source: "pack", productCode: "bulk", expiresAt: null, idempotencyKey: "v:pack" });
  await credits.grantCredits({ userId: uid, amount: 10, type: "pack_purchase_grant",
    source: "pack", productCode: "bulk", expiresAt: null, idempotencyKey: "v:pack" });
  eq("duplicate webhook grant is ignored", (await credits.getBalance(uid)).total, WELCOME + 10);

  await credits.grantCredits({ userId: uid, amount: 5, type: "subscription_grant",
    source: "subscription", productCode: "lite",
    expiresAt: new Date(Date.now() - 1000), idempotencyKey: "v:expired" });
  eq("expired credits are unspendable", (await credits.getBalance(uid)).total, WELCOME + 10);
  const b = await credits.getBalance(uid);
  eq("breakdown free/subscription/pack", [b.free, b.subscription, b.pack], [WELCOME, 0, 10]);

  group("Debits, refunds and concurrency");
  const key = "v:debit";
  await credits.debitOneCredit(uid, "tryon_debit", key);
  yes("repeated debit with same key is a no-op",
      (await credits.debitOneCredit(uid, "tryon_debit", key)).alreadyApplied);
  eq("one credit spent", (await credits.getBalance(uid)).total, WELCOME + 9);

  await credits.refundCredit(uid, key);
  await credits.refundCredit(uid, key);
  eq("failed generation refunds exactly once", (await credits.getBalance(uid)).total, WELCOME + 10);

  // Drain to exactly one so the race below tests the case that matters:
  // several requests competing for the last remaining credit.
  const drain = (await credits.getBalance(uid)).total - 1;
  await q`INSERT INTO credit_ledger (user_id,type,credit_amount,source_type,idempotency_key)
          VALUES (${uid},'admin_adjustment',${-drain},'refund',${"v:drain"})`;
  eq("drained to a single credit", (await credits.getBalance(uid)).total, 1);
  const race = await Promise.all(
    Array.from({ length: 8 }, (_, i) => credits.debitOneCredit(uid, "tryon_debit", `v:race${i}`)));
  eq("only one of 8 concurrent debits wins", race.filter((r) => r.ok && r.ledgerId).length, 1);
  eq("balance never goes negative", (await credits.getBalance(uid)).total, 0);
  no("debit refused at zero", (await credits.debitOneCredit(uid, "tryon_debit", "v:empty")).ok);

  group("Generation throttles");
  yes("first generation slot claimed", await credits.claimGenerationSlot(uid));
  no("second claim blocked while held", await credits.claimGenerationSlot(uid));
  await credits.releaseGenerationSlot(uid);
  yes("slot reusable after release", await credits.claimGenerationSlot(uid));
  await credits.releaseGenerationSlot(uid);
  const claims = await Promise.all(Array.from({ length: 6 }, () => credits.claimGenerationSlot(uid)));
  eq("only one of 6 concurrent claims wins", claims.filter(Boolean).length, 1);
  await q`UPDATE billing_profiles SET active_generation_at = now() - interval '10 minutes'
           WHERE user_id = ${uid}`;
  yes("abandoned lease is reclaimable", await credits.claimGenerationSlot(uid));
  await credits.releaseGenerationSlot(uid);
  // One debit above, plus exactly one winner from the race — the other seven
  // never inserted a row, which is the behaviour being asserted.
  eq("hourly counter reflects recent debits", await credits.recentGenerationCount(uid), 2);
  process.env.TRYON_GENERATION_DISABLED = "1";
  yes("kill switch reads on", credits.generationDisabled());
  delete process.env.TRYON_GENERATION_DISABLED;
  no("kill switch off by default", credits.generationDisabled());

  group("Welcome vs monthly grant");
  const [fresh] = await q`INSERT INTO users (email,name)
    VALUES (${`__verify_new_${Date.now()}@example.invalid`}, 'New') RETURNING id`;
  await credits.ensureProfile(fresh.id);
  await credits.grantFreeMonthlyCredit(fresh.id);
  eq("first ever grant is the welcome amount", (await credits.getBalance(fresh.id)).total, WELCOME);
  const [g] = await q`SELECT expires_at FROM credit_ledger
                       WHERE user_id=${fresh.id} AND type='free_monthly_grant'`;
  const days = Math.round((new Date(g.expires_at) - Date.now()) / 86400000);
  yes("welcome credits get a 30-day window, not month-end", days >= 28 && days <= 31);
  // Pretend a month passed: the key changes, so the next grant lands.
  await q`UPDATE credit_ledger SET idempotency_key=${`free:${fresh.id}:1970-01`}
           WHERE user_id=${fresh.id} AND type='free_monthly_grant'`;
  await credits.grantFreeMonthlyCredit(fresh.id);
  eq("the next month grants the monthly amount",
     (await credits.getBalance(fresh.id)).total, WELCOME + credits.MONTHLY_FREE_CREDITS);
  await q`DELETE FROM users WHERE id=${fresh.id}`;

  group("Chat quota");
  let allowed = 0;
  for (let i = 0; i < 12; i++) if ((await credits.consumeChat(uid)).allowed) allowed++;
  eq("free tier gets exactly 10 chats", allowed, 10);
  await credits.releaseChat(uid);
  yes("a failed chat is released", (await credits.consumeChat(uid)).allowed);

  group("Webhook idempotency");
  const ev = `evt_verify_${Date.now()}`;
  yes("first delivery accepted", await credits.claimWebhookEvent(ev, "payment.captured"));
  no("retry of the same delivery rejected", await credits.claimWebhookEvent(ev, "payment.captured"));
  yes("a different delivery accepted", await credits.claimWebhookEvent(`${ev}_b`, "order.paid"));

  group("Signatures");
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (secret) {
    const sig = createHmac("sha256", secret).update("order_X|pay_Y").digest("hex");
    yes("valid checkout signature accepted", rzp.verifyPaymentSignature("order_X", "pay_Y", sig));
    no("tampered signature rejected", rzp.verifyPaymentSignature("order_X", "pay_Y", sig.replace(/.$/, "0")));
    no("signature bound to another order rejected", rzp.verifyPaymentSignature("order_Z", "pay_Y", sig));
  } else console.log("  – skipped, RAZORPAY_KEY_SECRET not set");

  if (process.env.RAZORPAY_WEBHOOK_SECRET) {
    const body = JSON.stringify({ event: "payment.captured" });
    const wsig = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
    yes("valid webhook signature accepted", rzp.verifyWebhookSignature(body, wsig));
    no("modified webhook body rejected", rzp.verifyWebhookSignature(body + " ", wsig));
  } else {
    no("no webhook secret ⇒ every webhook rejected", rzp.verifyWebhookSignature("{}", "abc"));
    console.log("  ! RAZORPAY_WEBHOOK_SECRET unset — webhooks are rejected, so no credits can be granted");
  }

  group("Live Razorpay (test mode)");
  if (rzp.razorpayConfigured()) {
    const starter = cat.PACKS.find((p) => p.code === "starter");
    const order = await rzp.createOrder({ amountPaise: starter.amountPaise,
      receipt: `verify-${Date.now()}`, notes: { purpose: "verification" } });
    yes("order created against the live API", order.id);
    eq("amount comes from the server catalogue", order.amount, starter.amountPaise);
    eq("currency is INR", order.currency, "INR");
    console.log(`    order ${order.id}`);
    for (const p of cat.PLANS) {
      const id = cat.planIdFromEnv(p);
      console.log(`  ${id ? "✓" : "!"} plan ${p.name.padEnd(5)} ${id ?? "not configured — subscriptions return 503"}`);
    }
  } else console.log("  – skipped, Razorpay keys not set");
} finally {
  await q`DELETE FROM users WHERE id = ${uid}`;
  await q`DELETE FROM webhook_events WHERE event_id LIKE 'evt_verify_%'`;
  const [{ n }] = await q`SELECT count(*)::int n FROM credit_ledger WHERE user_id = ${uid}`;
  console.log(`\ncleanup: ${n} ledger rows left behind`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
