import { useCallback, useEffect, useState } from "react";
import PageShell, { PageTitle } from "../components/PageShell";
import Button from "../components/ui/Button";
import Surface from "../components/ui/Surface";
import SectionHeading from "../components/ui/SectionHeading";
import { Badge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth";
import { Check, Sparkles } from "../components/ui/icons";
import { isNativeApp } from "../platform";
import { getCatalogue, getSummary, startCheckout, type BillingSummary, type Catalogue, planName, planDetail } from "../billing";

function dateLabel(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Plans() {
  /*
   * Both stores require digital goods bought inside an app to go through
   * their own billing, so the app shows what you have and what a plan
   * includes, and offers no way to buy. Deliberately no explanation of where
   * to buy instead: pointing elsewhere is the specific thing the rule
   * forbids, and a rejection costs a review cycle.
   */
  const canPurchaseHere = !isNativeApp();

  const { user } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, c] = await Promise.all([getSummary(), getCatalogue()]);
      setSummary(s);
      setCatalogue(c);
    } catch (err: any) {
      setError(err?.message ?? "Could not load your plan");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Credits arrive with the webhook, not the checkout callback, so after a
  // successful payment we poll briefly rather than claiming success early.
  useEffect(() => {
    if (!awaitingWebhook) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      const before = summary?.credits.total ?? 0;
      try {
        const s = await getSummary();
        setSummary(s);
        if (s.credits.total > before) {
          setAwaitingWebhook(false);
          toast("Credits added", { tone: "success" });
        }
      } catch {
        /* keep polling */
      }
      if (tries >= 10) setAwaitingWebhook(false);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingWebhook]);

  async function buy(kind: "pack" | "subscription", code: string) {
    if (!user || busyCode) return;
    setBusyCode(code);
    const r = await startCheckout(kind, code, { name: user.name, email: user.email });
    setBusyCode(null);
    if (!r.ok && "message" in r) {
      // Surfaced as-is: the backend already words these for a customer.
      if (/already on|already subscribed/i.test(r.message)) {
        toast(r.message, { tone: "error" });
        load();
        return;
      }
      if (/changing plans/i.test(r.message)) {
        toast(r.message, { tone: "error" });
        return;
      }
    }
    if (r.ok) {
      setAwaitingWebhook(true);
      toast("Payment received — confirming your credits…", { tone: "success" });
    } else if ("cancelled" in r) {
      // In the Android app the callback can be lost to a UPI app switch, so
      // a dismissal there means "check with the server", not "cancelled".
      if (r.verifyAnyway) {
        setAwaitingWebhook(true);
        toast("Checking whether that payment went through…");
      }
    } else {
      toast(r.message, { tone: "error" });
    }
  }

  if (!summary || !catalogue) {
    return (
      <PageShell width="narrow">
        <PageTitle title="Plans & credits" />
        {error ? (
          <ErrorBanner onRetry={load}>{error}</ErrorBanner>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-40 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        )}
      </PageShell>
    );
  }

  const c = summary.credits;

  return (
    <PageShell width="narrow">
      <PageTitle title="Plans & credits" subtitle="Your Try-on credits and plan." />

      {error && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}

      {awaitingWebhook && (
        <Surface tone="sky" className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
          <div className="text-[13px] text-ink/75 leading-relaxed">
            <p className="font-semibold text-ink">Your payment is being confirmed securely.</p>
            <p className="mt-0.5">
              Credits will appear as soon as payment confirmation is complete. If this takes longer
              than a minute, refresh your Plans &amp; Credits page.
            </p>
          </div>
        </Surface>
      )}

      {/* -------------------------------------------------- current usage */}
      <section className="rounded-card border border-brand-200/70 bg-gradient-to-br from-lilac via-lilac/60 to-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-wider text-ink/55">Current plan</p>
            <p className="text-[19px] font-bold tracking-tight mt-0.5">{planName(summary)}</p>
            {planDetail(summary) && (
              <p className="text-[12.5px] text-ink/60 mt-0.5">{planDetail(summary)}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[12px] uppercase tracking-wider text-ink/55">Credits left</p>
            <p className="text-[26px] font-bold leading-none mt-1 text-brand-700">{c.total}</p>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 mt-3.5 pt-3.5 border-t border-brand-300/30">
          <Stat label="Free monthly" value={c.free} />
          <Stat label="Subscription" value={c.subscription} />
          <Stat label="Purchased" value={c.pack} />
        </dl>

        <div className="mt-3.5 pt-3.5 border-t border-brand-300/30">
          <p className="text-[12px] uppercase tracking-wider text-ink/55">AI styling chat</p>
          <p className="text-[13.5px] font-semibold mt-0.5">
            {summary.chat.limited
              ? `${Math.max(0, summary.chat.limit - summary.chat.used)} of ${summary.chat.limit} AI chats remaining this month`
              : "Unlimited AI styling chat"}
          </p>
        </div>

        {(c.nextExpiry || summary.renewsAt || summary.chat.resetsAt) && (
          <p className="text-[12px] text-ink/60 mt-2.5">
            {c.nextExpiry && <>Next credit reset: {dateLabel(c.nextExpiry)}. </>}
            {summary.chat.limited && summary.chat.resetsAt && (
              <>Chats reset {dateLabel(summary.chat.resetsAt)}. </>
            )}
            {summary.renewsAt && <>Plan renews {dateLabel(summary.renewsAt)}.</>}
          </p>
        )}
      </section>

      {summary.tier === "free" && (
        <Surface tone="lilac">
          <p className="text-[13.5px] font-semibold">Free plan</p>
          <p className="text-[12.5px] text-ink/70 mt-0.5">{catalogue.free.blurb}</p>
        </Surface>
      )}

      {!catalogue.configured && (
        <ErrorBanner>Payments aren't switched on yet, so buying is unavailable.</ErrorBanner>
      )}

      {/* -------------------------------------------------------- packs */}
      <section className="space-y-3">
        <SectionHeading title="Need a few more looks?" hint="One-off top-ups." as="h2" />
        <div className="space-y-2">
          {catalogue.packs.map((p) => (
            <div key={p.code} className="surface p-4 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold flex items-center gap-2">
                  {p.name}
                  {p.badge && <Badge tone="mint">{p.badge}</Badge>}
                </p>
                <p className="text-[12.5px] text-ink/70 mt-0.5">{p.blurb}</p>
                <p className="text-[12px] text-ink/60 mt-1">
                  {p.credits} Try-on credits · {p.note}
                </p>
                <p className="text-[12px] text-ink/60">{p.chatNote}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[17px] font-bold">
                  {p.listPriceLabel && (
                    <span className="text-[12.5px] font-medium text-ink/45 line-through mr-1.5">
                      {p.listPriceLabel}
                    </span>
                  )}
                  {p.priceLabel}
                </p>
                {canPurchaseHere && (
                  <Button
                    size="sm"
                    className="mt-1"
                    loading={busyCode === p.code}
                    disabled={!catalogue.configured || Boolean(busyCode)}
                    onClick={() => buy("pack", p.code)}
                  >
                    Buy
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-ink/60">All prices include GST.</p>
      </section>

      {/* ------------------------------------------------ subscriptions */}
      <section className="space-y-3">
        <SectionHeading title="Get more Try-on every month" hint="Includes unlimited chat." as="h2" />
        <div className="space-y-2">
          {catalogue.plans.map((p) => {
            const active = summary.tier === p.code && summary.subscriptionStatus === "active";
            return (
              <div
                key={p.code}
                className={`rounded-card border p-4 ${
                  active ? "border-brand-500 bg-brand-50" : "border-ink/[0.07] bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold flex items-center gap-2">
                      {p.name}
                      {p.badge && <Badge tone="lilac">{p.badge}</Badge>}
                      {active && <Badge tone="mint">Current plan</Badge>}
                    </p>
                    <p className="text-[12.5px] text-ink/70 mt-0.5">{p.blurb}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[17px] font-bold">
                      {p.listPriceLabel && (
                        <span className="text-[12.5px] font-medium text-ink/45 line-through mr-1.5">
                          {p.listPriceLabel}
                        </span>
                      )}
                      {p.priceLabel}
                      <span className="text-[12px] font-normal text-ink/55">/mo</span>
                    </p>
                    {(canPurchaseHere || active) && (
                      <Button
                        size="sm"
                        variant={active ? "secondary" : "primary"}
                        className="mt-1"
                        loading={busyCode === p.code}
                        disabled={!canPurchaseHere || !catalogue.configured || active || Boolean(busyCode)}
                        onClick={() => buy("subscription", p.code)}
                      >
                        {active ? "Active" : "Subscribe"}
                      </Button>
                    )}
                  </div>
                </div>
                <ul className="mt-2.5 space-y-1">
                  {[p.creditLine, "+ 1 free credit every month", p.chatNote, p.expiryNote].map((n) => (
                    <li key={n} className="flex items-start gap-1.5 text-[12.5px] text-ink/70">
                      <Check className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" />
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {summary.subscriptionStatus === "active" && (
          <p className="text-[12px] text-ink/60">
            Changing between plans isn't supported yet — cancel first, then subscribe to the new
            one.{" "}
          </p>
        )}
        {summary.subscriptionStatus === "active" && (
          <p className="text-[12px] text-ink/60">
            To cancel, reply to any payment email from Razorpay or contact us — we'll stop the
            renewal and you keep your credits until {dateLabel(summary.renewsAt) ?? "the cycle ends"}.
          </p>
        )}
        {summary.subscriptionStatus === "past_due" && (
          <ErrorBanner>
            Your last payment didn't go through. Your existing credits are safe — retry from your
            Razorpay email to restart the plan.
          </ErrorBanner>
        )}
      </section>

      {/* ------------------------------------------------ explanations */}
      <section className="space-y-3">
        <SectionHeading title="How Try-on credits work" as="h2" />
        <Surface>
          <ul className="space-y-1.5 text-[13px] text-ink/75">
            {[
              "A new Try-on look uses 1 credit.",
              "Regenerate new variation uses 1 credit.",
              "Cached looks are free.",
              "Purchased pack credits never expire.",
              "Monthly subscription credits reset each billing cycle.",
              `Every account gets ${catalogue.free.monthlyCredits} free Try-on credit every month.`,
              "Wardrobe uploads, outfit planning, sharing and history stay free.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-1" />
                {line}
              </li>
            ))}
          </ul>
        </Surface>
      </section>

      <section className="space-y-3">
        <SectionHeading title="AI styling chat" as="h2" />
        <Surface tone="mint">
          <ul className="space-y-1.5 text-[13px] text-ink/75">
            <li>Free plan: {catalogue.free.chatsPerMonth} styling chats each month.</li>
            <li>Lite, Plus and Style: unlimited AI styling chat while your subscription is active.</li>
            <li>Credit packs add Try-on credits, but do not change your chat allowance.</li>
          </ul>
        </Surface>
      </section>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink/55">{label}</dt>
      <dd className="text-[17px] font-semibold mt-0.5">{value}</dd>
    </div>
  );
}
