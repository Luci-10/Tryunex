import { api } from "./api";
import { isNativeApp } from "./platform";

export type CreditBalance = {
  total: number;
  free: number;
  subscription: number;
  pack: number;
  nextExpiry: string | null;
};

export type ChatQuota = {
  limited: boolean;
  used: number;
  limit: number;
  resetsAt: string | null;
};

export type ActivePack = {
  code: string;
  name: string;
  credits: number;
  purchasedAt: string;
  expiresAt: string | null;
};

export type BillingSummary = {
  tier: "free" | "lite" | "plus" | "style";
  subscriptionStatus: string;
  subscriptionStartedAt: string | null;
  renewsAt: string | null;
  credits: CreditBalance;
  chat: ChatQuota;
  activity: { label: string; amount: number; at: string }[];
  /** Present only while a purchased pack still has credits left. */
  activePack: ActivePack | null;
};

export type Catalogue = {
  currency: string;
  gstIncluded: boolean;
  keyId: string | null;
  configured: boolean;
  free: {
    welcomeCredits: number; monthlyCredits: number; chatsPerMonth: number; blurb: string;
  };
  packs: {
    code: string; name: string; credits: number; amountPaise: number;
    priceLabel: string; listPriceLabel: string | null; badge: string | null; note: string;
    blurb: string; chatNote: string;
  }[];
  plans: {
    code: string; name: string; creditsPerMonth: number; amountPaise: number;
    priceLabel: string; listPriceLabel: string | null; badge: string | null;
    blurb: string; creditLine: string; chatNote: string; expiryNote: string;
  }[];
};

export const getSummary = () => api.get<BillingSummary>("/billing/summary");
export const getCatalogue = () => api.get<Catalogue>("/billing/products");

export const TIER_LABEL: Record<string, string> = {
  free: "Free", lite: "Lite", plus: "Plus", style: "Style",
};

/**
 * What to call the plan someone is on, wherever it is shown.
 *
 * A subscription wins: it renews, so it describes the account for as long as
 * it lasts. A pack is named only while its credits are unspent — once they run
 * out the pack is history, not a plan. Falling back to Free is the honest
 * answer when neither applies.
 */
export function planName(summary: BillingSummary): string {
  if (summary.tier !== "free") return `${TIER_LABEL[summary.tier] ?? summary.tier} plan`;
  if (summary.activePack) return summary.activePack.name;
  return "Free plan";
}

/** The line under the plan name: what is left, and until when. */
export function planDetail(summary: BillingSummary): string | null {
  if (summary.tier !== "free") {
    if (!summary.renewsAt) return null;
    return `Renews ${new Date(summary.renewsAt).toLocaleDateString(undefined, {
      day: "numeric", month: "short",
    })}`;
  }
  const pack = summary.activePack;
  if (!pack) return null;
  const left = `${pack.credits} credit${pack.credits === 1 ? "" : "s"} left`;
  if (!pack.expiresAt) return left;
  return `${left} · expires ${new Date(pack.expiresAt).toLocaleDateString(undefined, {
    day: "numeric", month: "short",
  })}`;
}

/** Loads Razorpay's checkout script once, on demand. */
let checkoutPromise: Promise<boolean> | null = null;
function loadCheckout(): Promise<boolean> {
  if (checkoutPromise) return checkoutPromise;
  checkoutPromise = new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
  return checkoutPromise;
}

export type CheckoutOutcome =
  | { ok: true; pending: true }
  /** Dismissed, or a WebView flow whose callback we can't rely on. */
  | { ok: false; cancelled: true; verifyAnyway?: boolean }
  | { ok: false; message: string };

/**
 * Opens Razorpay checkout. The signature is verified server-side afterwards,
 * and credits are only ever granted by the webhook — so a closed tab still
 * gets what was paid for, and nothing here can grant anything on its own.
 */
export async function startCheckout(
  kind: "pack" | "subscription",
  code: string,
  user: { name: string; email: string },
): Promise<CheckoutOutcome> {
  const loaded = await loadCheckout();
  if (!loaded) {
    return {
      ok: false,
      message: "Could not load the payment window. Check your connection and try again.",
    };
  }

  let order: any;
  try {
    order = kind === "pack"
      ? await api.post("/billing/create-pack-order", { code })
      : await api.post("/billing/create-subscription", { code });
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "Could not start checkout" };
  }
  if (!order?.keyId) return { ok: false, message: "Payments are not configured yet" };

  return new Promise<CheckoutOutcome>((resolve) => {
    const rz = new (window as any).Razorpay({
      key: order.keyId,
      name: "TryUnex",
      description: order.productName ?? order.planName,
      ...(kind === "pack"
        ? { order_id: order.orderId, amount: order.amountPaise, currency: "INR" }
        : { subscription_id: order.subscriptionId }),
      prefill: { name: user.name, email: user.email },
      theme: { color: "#7657E8" },
      handler: async (resp: any) => {
        try {
          await api.post("/billing/verify-payment", resp);
          resolve({ ok: true, pending: true });
        } catch (err: any) {
          resolve({ ok: false, message: err?.message ?? "We couldn't verify that payment" });
        }
      },
      // Android WebView does not always deliver the handler callback after a
      // UPI app switch. That's survivable because the webhook is what grants
      // credits — so on native we ask the caller to poll the server rather
      // than treating a dismissal as a definite cancellation.
      modal: {
        ondismiss: () => resolve({ ok: false, cancelled: true, verifyAnyway: isNativeApp() }),
      },
    });
    rz.on("payment.failed", (e: any) =>
      resolve({ ok: false, message: e?.error?.description ?? "The payment did not go through" }),
    );
    rz.open();
  });
}
