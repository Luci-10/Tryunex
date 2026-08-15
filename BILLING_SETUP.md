# Razorpay setup for TryUnex

Nothing in the app can take a payment until these exist. Until then the
billing endpoints answer `503 Payments are not configured yet` and the Plans
page shows the catalogue with buying disabled — the rest of the app is
unaffected.

## 1. Environment variables

Set on Vercel (and in `backend/.env` for local work):

| Variable | Where it comes from |
|---|---|
| `RAZORPAY_KEY_ID` | Dashboard → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Same screen. Server only — never sent to the browser |
| `RAZORPAY_WEBHOOK_SECRET` | Set when creating the webhook, below |
| `RAZORPAY_PLAN_LITE_ID` / `_PLUS_ID` / `_STYLE_ID` | Plan ids from step 3 |

Only `RAZORPAY_KEY_ID` ever reaches the client, and only via
`GET /api/billing/products`.

## 2. One-time packs

Packs need no dashboard configuration — orders are created per purchase from
the server-side catalogue in `backend/src/services/billing/catalogue.ts`:

| Code | Credits | Price (GST incl.) |
|---|---:|---:|
| `starter` | 3 | ₹29 |
| `mid` | 6 | ₹52 |
| `bulk` | 10 | ₹79 |

The client sends only the code. The amount is always taken from the server.

## 3. Subscription plans

Dashboard → Subscriptions → Plans. Create three **monthly, INR** plans and put
their ids in the env vars above:

| Plan | Amount | Env var |
|---|---:|---|
| Lite | ₹55/month | `RAZORPAY_PLAN_LITE_ID` |
| Plus | ₹99/month | `RAZORPAY_PLAN_PLUS_ID` |
| Style | ₹199/month | `RAZORPAY_PLAN_STYLE_ID` |

Enable UPI AutoPay, cards and eMandate on the account so recurring collection
works for Indian customers.

## 4. Webhook

Dashboard → Settings → Webhooks → Add.

- URL: `https://www.tryunex.in/api/billing/webhook`
- Secret: any strong random string; put the same value in `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.authorized`, `payment.captured`, `order.paid`, `payment.failed`,
  `subscription.activated`, `subscription.charged`, `subscription.halted`,
  `subscription.cancelled`, `subscription.completed`, `refund.created`

Every delivery id is recorded in `webhook_events`, so a Razorpay retry
short-circuits before any handler runs. Grant-level idempotency keys back that
up, so credits cannot be added twice even if the id is missing.

**The webhook is the only thing that grants credits.** The browser callback is
signature-verified but grants nothing, so a customer who closes the tab still
receives what they paid for, and a forged callback achieves nothing.

## 5. Callback URLs

Add `https://www.tryunex.in` to the allowed origins for Checkout.

## What is deliberately not automated

Refunds and chargebacks mark the payment `refunded` and log a warning for
review. They do not claw credits back automatically: the credits may already
be spent, and silently creating a negative balance is worse than a human
looking at it.

## Operational controls

| Control | How |
|---|---|
| Pause all fresh Try-on generation | Set `TRYON_GENERATION_DISABLED=1` and redeploy. Cached looks keep working, no credits are spent, and users see "Try-on generation is paused right now. Your credits are safe." |
| Per-user rate limit | 20 fresh generations per rolling hour, counted from the ledger. Change `GENERATION_RATE_LIMIT` in `services/billing/credits.ts`. |
| One generation at a time | Enforced per user by a 3-minute lease on `billing_profiles.active_generation_at`. A crashed request self-heals when the lease expires. |

## Metrics

Every business event emits one JSON line to the Vercel function logs — search
by `"metric":"<name>"`:

`purchase_started`, `purchase_granted`, `payment_failed`,
`subscription_activated`, `subscription_renewed`, `subscription_cancelled`,
`tryon_cache_hit`, `tryon_generated`, `tryon_regenerated`, `tryon_failed`,
`tryon_refused_no_credits`, `tryon_rate_limited`, `tryon_busy`,
`tryon_disabled`, `credits_granted`, `credits_debited`, `credits_refunded`,
`chat_used`, `chat_limit_reached`, `generation_failed_gemini`,
`generation_failed_r2`.

No provider ids, amounts, or margin figures are logged.

## Android (Capacitor)

Razorpay Checkout runs inside the Android WebView, but a UPI app switch can
swallow the success callback. That is survivable by design: the webhook is
what grants credits, so the app treats a dismissal on native as "ask the
server" rather than "cancelled", and polls the billing summary. Nothing about
payment state is stored on the device.

This path has not been tested on a physical device.


## Local development

Razorpay must reach your machine to deliver webhooks. Use a secure tunnel:

```
npm run dev                       # backend on :3001
npx untun@latest tunnel http://localhost:3001    # or ngrok / cloudflared
```

Point a **test-mode** webhook at `<tunnel-url>/api/billing/webhook` with the
same event list, and set `RAZORPAY_WEBHOOK_SECRET` to match. Test-mode keys
and UPI test flows never move real money.
