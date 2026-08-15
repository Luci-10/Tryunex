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
  badge?: string;
};

export type Plan = {
  code: PlanCode;
  kind: "subscription";
  name: string;
  creditsPerMonth: number;
  amountPaise: number;
  /** Razorpay plan id env var, created in the dashboard. */
  razorpayPlanIdEnv: string;
  badge?: string;
};

export const PACKS: Pack[] = [
  { code: "starter", kind: "pack", name: "Starter pack", credits: 3, amountPaise: 2900 },
  { code: "mid", kind: "pack", name: "Mid pack", credits: 6, amountPaise: 5200 },
  { code: "bulk", kind: "pack", name: "Bulk pack", credits: 10, amountPaise: 7900, badge: "Best value" },
];

export const PLANS: Plan[] = [
  { code: "lite", kind: "subscription", name: "Lite", creditsPerMonth: 7, amountPaise: 5500, razorpayPlanIdEnv: "RAZORPAY_PLAN_LITE_ID" },
  { code: "plus", kind: "subscription", name: "Plus", creditsPerMonth: 14, amountPaise: 9900, razorpayPlanIdEnv: "RAZORPAY_PLAN_PLUS_ID", badge: "Most popular" },
  { code: "style", kind: "subscription", name: "Style", creditsPerMonth: 30, amountPaise: 19900, razorpayPlanIdEnv: "RAZORPAY_PLAN_STYLE_ID" },
];

export function findPack(code: string): Pack | undefined {
  return PACKS.find((p) => p.code === code);
}

export function findPlan(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}

/** Everything the client is allowed to know about the catalogue. */
export function customerCatalogue() {
  return {
    currency: "INR",
    gstIncluded: true,
    packs: PACKS.map((p) => ({
      code: p.code,
      name: p.name,
      credits: p.credits,
      amountPaise: p.amountPaise,
      priceLabel: `₹${(p.amountPaise / 100).toFixed(0)}`,
      badge: p.badge ?? null,
      note: "Never expires",
    })),
    plans: PLANS.map((p) => ({
      code: p.code,
      name: p.name,
      creditsPerMonth: p.creditsPerMonth,
      amountPaise: p.amountPaise,
      priceLabel: `₹${(p.amountPaise / 100).toFixed(0)}`,
      badge: p.badge ?? null,
      notes: [
        "Monthly credits reset each billing cycle",
        "Includes unlimited normal AI chat",
      ],
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
