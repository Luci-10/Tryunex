// Billing: catalogue, checkout creation, verification, and the webhook that
// is the actual source of truth for granting credits.
import { Router, raw } from "express";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { requireAuth } from "../services/auth.js";
import { customerCatalogue, findPack, findPlan, planIdFromEnv } from "../services/billing/catalogue.js";
import {
  claimWebhookEvent,
  ensureBillingSchema,
  ensureProfile,
  getBalance,
  getActivePack,
  getChatQuota,
  grantCredits,
  grantFreeMonthlyCredit,
  recentActivity,
} from "../services/billing/credits.js";
import {
  createCustomer,
  createOrder,
  createSubscription,
  publicKeyId,
  razorpayConfigured,
  verifyPaymentSignature,
  verifySubscriptionSignature,
  verifyWebhookSignature,
} from "../services/billing/razorpay.js";
import { monthPeriod } from "../services/billing/period.js";
import { metric } from "../services/metrics.js";

const router = Router();

function sql() {
  return neon(process.env.DATABASE_URL!);
}

/* --------------------------------------------------------------- webhook */
// Mounted before requireAuth and before the JSON parser: the signature is
// over the exact bytes Razorpay sent, so the raw body must survive intact.
router.post("/webhook", raw({ type: "*/*" }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const signature = String(req.header("x-razorpay-signature") ?? "");
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[billing] webhook signature rejected");
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // Razorpay retries; the event id makes replays harmless.
  const eventId = String(req.header("x-razorpay-event-id") ?? event?.id ?? "");
  const kind = String(event?.event ?? "");
  await ensureBillingSchema();
  const q = sql();

  // Razorpay retries until it gets a 2xx. Recording the delivery id first
  // means a retry short-circuits here instead of re-running the handlers.
  const firstDelivery = await claimWebhookEvent(eventId, kind);
  if (!firstDelivery) {
    console.log(`[billing] webhook replay ignored event=${eventId} type=${kind}`);
    return res.json({ ok: true, duplicate: true });
  }

  try {
    if (kind === "payment.authorized") {
      // Authorised is not captured. Record progress; credits wait for capture.
      const payment = event.payload?.payment?.entity ?? {};
      await q`
        UPDATE payments SET status='pending', razorpay_payment_id=${payment.id ?? null}, updated_at=now()
         WHERE razorpay_order_id = ${payment.order_id ?? null}`;
    } else if (kind === "payment.captured" || kind === "order.paid") {
      const payment = event.payload?.payment?.entity ?? {};
      const orderId = payment.order_id ?? event.payload?.order?.entity?.id;
      const rows = (await q`
        SELECT id, user_id, product_code, status FROM payments
         WHERE razorpay_order_id = ${orderId} LIMIT 1`) as any[];
      const record = rows[0];
      if (!record) {
        console.warn("[billing] webhook for unknown order", orderId);
        return res.json({ ok: true });
      }
      const pack = findPack(record.product_code);
      if (pack) {
        const granted = await grantCredits({
          userId: record.user_id,
          amount: pack.credits,
          type: "pack_purchase_grant",
          source: "pack",
          productCode: pack.code,
          expiresAt: null, // pack credits never expire
          idempotencyKey: `pack:${orderId}`,
          paymentId: record.id,
        });
        await q`
          UPDATE payments
             SET status = 'paid', razorpay_payment_id = ${payment.id ?? null},
                 webhook_event_id = COALESCE(webhook_event_id, ${eventId || null}),
                 verified_at = now(), updated_at = now()
           WHERE id = ${record.id}`;
        metric("purchase_granted", { kind: "pack", code: pack.code, firstTime: granted });
        if (granted) metric("credits_granted", { source: "pack", amount: pack.credits });
      }
    } else if (kind === "subscription.activated" || kind === "subscription.charged") {
      const sub = event.payload?.subscription?.entity ?? {};
      const rows = (await q`
        SELECT id, user_id, product_code FROM payments
         WHERE razorpay_subscription_id = ${sub.id} ORDER BY created_at DESC LIMIT 1`) as any[];
      const record = rows[0];
      if (!record) return res.json({ ok: true });
      const plan = findPlan(record.product_code);
      if (plan) {
        const periodStart = sub.current_start ? new Date(sub.current_start * 1000) : new Date();
        const periodEnd = sub.current_end
          ? new Date(sub.current_end * 1000)
          : monthPeriod().end;
        // One grant per billing cycle, keyed on the cycle start.
        await grantCredits({
          userId: record.user_id,
          amount: plan.creditsPerMonth,
          type: "subscription_grant",
          source: "subscription",
          productCode: plan.code,
          expiresAt: periodEnd,
          idempotencyKey: `sub:${sub.id}:${sub.current_start ?? periodStart.getTime()}`,
          paymentId: record.id,
        });
        await q`
          UPDATE billing_profiles
             SET current_tier = ${plan.code}::billing_tier,
                 subscription_status = 'active',
                 razorpay_subscription_id = ${sub.id},
                 subscription_started_at = COALESCE(subscription_started_at, now()),
                 subscription_current_period_start = ${periodStart.toISOString()},
                 subscription_current_period_end = ${periodEnd.toISOString()},
                 updated_at = now()
           WHERE user_id = ${record.user_id}`;
        await q`UPDATE payments SET status='paid', verified_at=now(), updated_at=now() WHERE id=${record.id}`;
        metric(kind === "subscription.activated" ? "subscription_activated" : "subscription_renewed", {
          code: plan.code,
        });
      }
    } else if (kind === "subscription.halted" || kind === "payment.failed") {
      const sub = event.payload?.subscription?.entity;
      if (sub?.id) {
        // Past due keeps whatever they already earned; nothing is removed.
        metric("payment_failed", { reason: "subscription" });
        await q`
          UPDATE billing_profiles SET subscription_status='past_due', updated_at=now()
           WHERE razorpay_subscription_id = ${sub.id}`;
      }
    } else if (kind === "subscription.cancelled") {
      const sub = event.payload?.subscription?.entity ?? {};
      // Benefits stand until the period they already paid for ends.
      metric("subscription_cancelled", {});
      await q`
        UPDATE billing_profiles
           SET subscription_status='cancelled', subscription_cancelled_at=now(), updated_at=now()
         WHERE razorpay_subscription_id = ${sub.id}`;
    } else if (kind === "subscription.completed" || kind === "subscription.expired") {
      const sub = event.payload?.subscription?.entity ?? {};
      await q`
        UPDATE billing_profiles
           SET subscription_status='expired', current_tier='free', updated_at=now()
         WHERE razorpay_subscription_id = ${sub.id}`;
    } else if (kind.startsWith("refund.")) {
      // Deliberately not automated: a refund can't safely claw back credits
      // that may already be spent. Flag it and let a human decide.
      const payment = event.payload?.payment?.entity ?? {};
      metric("payment_failed", { reason: "refund" });
      await q`
        UPDATE payments SET status='refunded', updated_at=now()
         WHERE razorpay_payment_id = ${payment.id ?? null}`;
      console.warn(`[billing] refund received, needs review payment=${payment.id}`);
    }
  } catch (err) {
    console.error("[billing] webhook handling failed", kind, err);
    // 500 asks Razorpay to retry; the idempotency keys make that safe.
    return res.status(500).json({ error: "Webhook processing failed" });
  }

  res.json({ ok: true });
});

/* ------------------------------------------------------ authed endpoints */
router.use(requireAuth);

router.get("/products", async (_req, res) => {
  res.json({ ...customerCatalogue(), keyId: publicKeyId(), configured: razorpayConfigured() });
});

router.get("/summary", async (req, res) => {
  const userId = req.userId!;
  const profile = await ensureProfile(userId);
  await grantFreeMonthlyCredit(userId);
  const [balance, quota, activity, pack] = await Promise.all([
    getBalance(userId),
    getChatQuota(userId),
    recentActivity(userId),
    getActivePack(userId),
  ]);

  // A pack is worth naming only while its credits are actually left. The pack
  // bucket is what is still unspent after free and subscription credits, so it
  // going to zero is exactly "the pack is exhausted".
  const activePack =
    pack && balance.pack > 0
      ? {
          code: pack.code,
          name: findPack(pack.code)?.name ?? "Credit pack",
          credits: balance.pack,
          purchasedAt: pack.purchasedAt,
          expiresAt: pack.expiresAt,
        }
      : null;

  res.json({
    tier: profile.currentTier,
    subscriptionStatus: profile.subscriptionStatus,
    subscriptionStartedAt: profile.subscriptionStartedAt,
    renewsAt: profile.subscriptionCurrentPeriodEnd,
    credits: balance,
    chat: quota,
    activity,
    activePack,
  });
});

router.post("/create-pack-order", async (req, res) => {
  if (!razorpayConfigured()) return res.status(503).json({ error: "Payments are not configured yet" });
  const parse = z.object({ code: z.string() }).safeParse(req.body);
  // The amount is never taken from the client — only the code is.
  const pack = parse.success ? findPack(parse.data.code) : undefined;
  if (!pack) return res.status(400).json({ error: "Unknown pack" });

  await ensureBillingSchema();
  const q = sql();
  const order = await createOrder({
    amountPaise: pack.amountPaise,
    receipt: `pack-${pack.code}-${Date.now()}`,
    notes: { userId: req.userId!, productCode: pack.code },
  });
  await q`
    INSERT INTO payments (user_id, product_code, kind, amount_paise, razorpay_order_id, status)
    VALUES (${req.userId!}, ${pack.code}, 'pack', ${pack.amountPaise}, ${order.id}, 'pending')`;
  metric("purchase_started", { kind: "pack", code: pack.code });

  res.json({
    orderId: order.id,
    amountPaise: pack.amountPaise,
    currency: "INR",
    keyId: publicKeyId(),
    productName: pack.name,
  });
});

router.post("/create-subscription", async (req, res) => {
  if (!razorpayConfigured()) return res.status(503).json({ error: "Payments are not configured yet" });
  const parse = z.object({ code: z.string() }).safeParse(req.body);
  const plan = parse.success ? findPlan(parse.data.code) : undefined;
  if (!plan) return res.status(400).json({ error: "Unknown plan" });

  const planId = planIdFromEnv(plan);
  if (!planId) {
    return res.status(503).json({ error: `${plan.name} is not available yet` });
  }

  await ensureBillingSchema();
  const profile = await ensureProfile(req.userId!);
  const q = sql();

  // Already on this plan and paid up — don't let them buy it twice.
  if (profile.currentTier === plan.code && profile.subscriptionStatus === "active") {
    return res.status(409).json({ code: "ALREADY_SUBSCRIBED", error: `You're already on ${plan.name}` });
  }
  if (profile.subscriptionStatus === "active" && profile.currentTier !== "free") {
    return res.status(409).json({
      code: "PLAN_CHANGE_UNSUPPORTED",
      error: "Changing plans isn't supported yet. Cancel your current plan first, then subscribe.",
    });
  }

  // Reuse the stored Razorpay customer where we have one; create it once.
  const existing = (await q`
    SELECT razorpay_customer_id FROM billing_profiles WHERE user_id = ${req.userId!} LIMIT 1`) as any[];
  let customerId: string | null = existing[0]?.razorpay_customer_id ?? null;
  if (!customerId) {
    const users = (await q`SELECT name, email FROM users WHERE id = ${req.userId!} LIMIT 1`) as any[];
    const created = await createCustomer({
      name: users[0]?.name ?? "TryUnex customer",
      email: users[0]?.email ?? "",
      notes: { userId: req.userId! },
    });
    customerId = created?.id ?? null;
    if (customerId) {
      await q`UPDATE billing_profiles SET razorpay_customer_id=${customerId}, updated_at=now()
               WHERE user_id = ${req.userId!}`;
    }
  }

  const sub = await createSubscription({
    planId,
    totalCount: 120, // ten years of monthly cycles; cancellation ends it
    customerId,
    notes: { userId: req.userId!, productCode: plan.code },
  });
  await q`
    INSERT INTO payments (user_id, product_code, kind, amount_paise, razorpay_subscription_id, status)
    VALUES (${req.userId!}, ${plan.code}, 'subscription', ${plan.amountPaise}, ${sub.id}, 'pending')`;
  await q`
    UPDATE billing_profiles
       SET subscription_status='pending', razorpay_subscription_id=${sub.id}, updated_at=now()
     WHERE user_id = ${req.userId!}`;

  metric("purchase_started", { kind: "subscription", code: plan.code });
  res.json({ subscriptionId: sub.id, keyId: publicKeyId(), planName: plan.name });
});

// Confirms the checkout callback really came from Razorpay. Credits are NOT
// granted here — the webhook does that — so a user who closes the tab still
// gets what they paid for, and a forged callback grants nothing.
router.post("/verify-payment", async (req, res) => {
  const parse = z
    .object({
      razorpay_order_id: z.string().optional(),
      razorpay_payment_id: z.string(),
      razorpay_signature: z.string(),
      razorpay_subscription_id: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const d = parse.data;

  const valid = d.razorpay_subscription_id
    ? verifySubscriptionSignature(d.razorpay_payment_id, d.razorpay_subscription_id, d.razorpay_signature)
    : d.razorpay_order_id
      ? verifyPaymentSignature(d.razorpay_order_id, d.razorpay_payment_id, d.razorpay_signature)
      : false;

  if (!valid) {
    console.warn("[billing] checkout signature rejected user=", req.userId);
    return res.status(400).json({ verified: false, error: "Could not verify this payment" });
  }

  await ensureBillingSchema();
  const q = sql();
  // A valid signature only proves Razorpay produced it. This proves the order
  // belongs to the caller, so one user cannot confirm another's payment.
  const owned = (await q`
    UPDATE payments SET razorpay_payment_id=${d.razorpay_payment_id}, updated_at=now()
     WHERE user_id=${req.userId!}
       AND (razorpay_order_id = ${d.razorpay_order_id ?? null}
            OR razorpay_subscription_id = ${d.razorpay_subscription_id ?? null})
    RETURNING id, status`) as any[];

  if (owned.length === 0) {
    console.warn(`[billing] verify-payment: no matching order for user=${req.userId}`);
    return res.status(404).json({ verified: false, error: "We couldn't find that order" });
  }

  // Credits are granted by the webhook, never here — so a replayed or
  // duplicated verification changes nothing.
  res.json({ verified: true, pending: true, alreadyPaid: owned[0].status === "paid" });
});

export default router;
