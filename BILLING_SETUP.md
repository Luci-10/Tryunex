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
| `RAZORPAY_PLAN_LITE` / `_PLUS` / `_STYLE` | Plan ids from step 3 |

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
| Lite | ₹55/month | `RAZORPAY_PLAN_LITE` |
| Plus | ₹99/month | `RAZORPAY_PLAN_PLUS` |
| Style | ₹199/month | `RAZORPAY_PLAN_STYLE` |

Enable UPI AutoPay, cards and eMandate on the account so recurring collection
works for Indian customers.

## 4. Webhook

Dashboard → Settings → Webhooks → Add.

- URL: `https://www.tryunex.in/api/billing/webhook`
- Secret: any strong random string; put the same value in `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `order.paid`, `payment.failed`,
  `subscription.activated`, `subscription.charged`, `subscription.halted`,
  `subscription.cancelled`, `subscription.completed`, `refund.created`

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
