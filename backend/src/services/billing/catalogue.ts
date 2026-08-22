// The single source of truth for what anything costs. The client sends a
// product code and nothing else — never an amount — so a tampered request
// can't buy 10 credits for ₹1.
//
// Prices are GST-inclusive, in paise, INR only. The margin figures from the
// business plan are deliberately absent: they are not needed to charge a
// customer and must never reach the client.

export type PackCode = "starter" | "mid" | "bulk";
export type PlanCode = "lite" | "plus" | "style";
export type ProductCode = PackCode | PlanCode;

export type Pack = {
  code: PackCode;
  kind: "pack";
  name: string;
  credits: number;
  amountPaise: number;
  /** Pre-discount figure, shown struck through beside the price. */
  listAmountPaise?: number;
  badge?: string;
};

export type Plan = {
  code: PlanCode;
  kind: "subscription";
  name: string;
  creditsPerMonth: number;
  amountPaise: number;
  /** Pre-discount figure, shown struck through beside the price. */
  listAmountPaise?: number;
  /** Razorpay plan id env var, created in the dashboard. */
  razorpayPlanIdEnv: string;
  badge?: string;
};

export const PACKS: Pack[] = [
  { code: "starter", kind: "pack", name: "Starter pack", credits: 3, amountPaise: 2900, listAmountPaise: 3900 },
  { code: "mid", kind: "pack", name: "Mid pack", credits: 6, amountPaise: 5900, listAmountPaise: 7900 },
  { code: "bulk", kind: "pack", name: "Bulk pack", credits: 10, amountPaise: 8900, listAmountPaise: 11900, badge: "Best value" },
];

export const PLANS: Plan[] = [
  { code: "lite", kind: "subscription", name: "Lite", creditsPerMonth: 7, amountPaise: 5900, listAmountPaise: 7900, razorpayPlanIdEnv: "RAZORPAY_PLAN_LITE_ID" },
  { code: "plus", kind: "subscription", name: "Plus", creditsPerMonth: 14, amountPaise: 11900, listAmountPaise: 15900, razorpayPlanIdEnv: "RAZORPAY_PLAN_PLUS_ID", badge: "Most popular" },
  { code: "style", kind: "subscription", name: "Style", creditsPerMonth: 30, amountPaise: 19900, listAmountPaise: 26900, razorpayPlanIdEnv: "RAZORPAY_PLAN_STYLE_ID" },
];

export function findPack(code: string): Pack | undefined {
  return PACKS.find((p) => p.code === code);
}

export function findPlan(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}

/** Blurbs live beside the numbers so the two can't drift apart. */
const PACK_BLURB: Record<PackCode, string> = {
  starter: "A small top-up for 3 extra looks. Credits never expire.",
  mid: "More room to explore outfits. Credits never expire.",
  bulk: "10 extra Try-on looks at our best top-up value.",
};

const PLAN_BLURB: Record<PlanCode, string> = {
  lite: "For occasional Try-on and unlimited styling chat.",
  plus: "The everyday plan for regular Try-on and unlimited styling chat.",
  style: "For frequent Try-on, new variations, and unlimited styling chat.",
};

/** Everything the client is allowed to know about the catalogue. */
export function customerCatalogue() {
  return {
    currency: "INR",
    gstIncluded: true,
    // Mirrors the server's real allowance so the page can describe the free
    // tier without hardcoding numbers that might change behind it.
    free: {
      welcomeCredits: 3,
      monthlyCredits: 1,
      chatsPerMonth: 10,
      blurb: "Start with 3 Try-on credits. Get 1 free credit every month.",
    },
    packs: PACKS.map((p) => ({
      code: p.code,
      name: p.name,
      credits: p.credits,
      amountPaise: p.amountPaise,
      priceLabel: `₹${(p.amountPaise / 100).toFixed(0)}`,
      // Display only. The amount charged is always amountPaise.
      listPriceLabel: p.listAmountPaise ? `₹${(p.listAmountPaise / 100).toFixed(0)}` : null,
      badge: p.badge ?? null,
      note: "Never expires",
      blurb: PACK_BLURB[p.code],
      // A pack adds credits only — it never changes the chat allowance.
      chatNote: "Uses your current chat allowance",
    })),
    plans: PLANS.map((p) => ({
      code: p.code,
      name: p.name,
      creditsPerMonth: p.creditsPerMonth,
      amountPaise: p.amountPaise,
      priceLabel: `₹${(p.amountPaise / 100).toFixed(0)}`,
      // Display only. The amount charged is always amountPaise.
      listPriceLabel: p.listAmountPaise ? `₹${(p.listAmountPaise / 100).toFixed(0)}` : null,
      badge: p.badge ?? null,
      blurb: PLAN_BLURB[p.code],
      creditLine: `${p.creditsPerMonth} plan credits + 1 free monthly credit`,
      chatNote: "Unlimited AI styling chat",
      expiryNote: "Monthly plan credits reset each billing cycle",
    })),
  };
}


/**
 * Reads a plan id, tolerating the older un-suffixed variable name so an
 * existing deployment doesn't lose its subscriptions on this rename.
 */
export function planIdFromEnv(plan: Plan): string | undefined {
  return process.env[plan.razorpayPlanIdEnv] ?? process.env[plan.razorpayPlanIdEnv.replace(/_ID$/, "")];
}
