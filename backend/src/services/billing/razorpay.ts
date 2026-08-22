// Razorpay over plain REST. The official SDK adds a dependency for what is
// three endpoints and two HMACs, and the secret must never leave the server
// either way.
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function publicKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Payments are not configured");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // Razorpay's error bodies can carry account detail — log, don't return.
    console.error("[razorpay] error", path, res.status, text);
    throw new Error("Payment provider rejected the request");
  }
  return JSON.parse(text) as T;
}

export function createOrder(opts: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}) {
  return call<{ id: string; amount: number; currency: string }>("/orders", {
    amount: opts.amountPaise,
    currency: "INR",
    receipt: opts.receipt,
    payment_capture: 1,
    notes: opts.notes,
  });
}

/** Creates a Razorpay customer. Reuse is handled by the caller via the id
 *  stored on the billing profile; Razorpay itself rejects duplicate emails
 *  with a specific error, which we treat as "already exists". */
export async function createCustomer(opts: { name: string; email: string; notes: Record<string, string> }) {
  try {
    return await call<{ id: string }>("/customers", {
      name: opts.name,
      email: opts.email,
      fail_existing: 0, // return the existing customer instead of erroring
      notes: opts.notes,
    });
  } catch {
    // A customer is a convenience, not a requirement — a subscription can be
    // created without one, so never block checkout on this.
    return null;
  }
}

export function createSubscription(opts: {
  planId: string;
  totalCount: number;
  customerId?: string | null;
  notes: Record<string, string>;
}) {
  return call<{ id: string; status: string; short_url?: string }>("/subscriptions", {
    plan_id: opts.planId,
    total_count: opts.totalCount,
    customer_notify: 1,
    ...(opts.customerId ? { customer_id: opts.customerId } : {}),
    notes: opts.notes,
  });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Checkout callback signature: HMAC(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Subscription callback signature: HMAC(payment_id|subscription_id, secret). */
export function verifySubscriptionSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

/** Webhook signature is over the exact raw body — never the parsed object. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

/**
 * What Razorpay will actually charge for a plan, in paise.
 *
 * A Razorpay plan's amount is fixed when the plan is created and cannot be
 * edited afterwards, so the price in our catalogue is only ever a label for
 * subscriptions. If the two drift apart the app advertises one figure and the
 * customer is billed another, which is a dispute waiting to happen — so the
 * subscription route asks before it sells.
 */
export async function planAmountPaise(planId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/plans/${encodeURIComponent(planId)}`, {
      headers: { authorization: authHeader() },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { item?: { amount?: number } };
    return typeof body.item?.amount === "number" ? body.item.amount : null;
  } catch {
    return null;
  }
}
