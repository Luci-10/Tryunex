// One structured line per business event, so Vercel's log search can answer
// "how many bulk packs sold today" without a separate analytics dependency.
// Never include provider ids, emails, amounts a customer didn't see, or any
// margin figures — logs get shared more casually than databases.
type Metric =
  | "purchase_started" | "purchase_granted" | "payment_failed"
  | "subscription_activated" | "subscription_renewed" | "subscription_cancelled"
  | "tryon_cache_hit" | "tryon_generated" | "tryon_regenerated"
  | "tryon_failed" | "tryon_refused_no_credits" | "tryon_rate_limited"
  | "tryon_busy" | "tryon_disabled"
  | "credits_granted" | "credits_debited" | "credits_refunded"
  | "chat_used" | "chat_limit_reached"
  | "generation_failed_gemini" | "generation_failed_r2"
  | "generation_failed_fal" | "generation_failed_fetch"
  | "media_rate_limited" | "media_denied" | "image_cleanup_failed";

export function metric(name: Metric, fields: Record<string, string | number | boolean> = {}) {
  try {
    console.log(JSON.stringify({ metric: name, at: new Date().toISOString(), ...fields }));
  } catch {
    /* logging must never break a request */
  }
}
