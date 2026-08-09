import { useCallback, useEffect, useRef, useState } from "react";
import IconButton from "../ui/IconButton";
import { Calendar, ChevronLeft, ChevronRight, Shirt, Sparkles, UserIcon, Users } from "../ui/icons";

type Feature = {
  title: string;
  body: string;
  icon: typeof Shirt;
  /** Tint used for the icon chip and the light-variant card. */
  tone: "lilac" | "peach" | "mint" | "sky";
};

export const FEATURES: Feature[] = [
  {
    title: "Your wardrobe",
    body: "Keep every favourite in one beautiful place.",
    icon: Shirt,
    tone: "lilac",
  },
  {
    title: "Plan with ease",
    body: "Build looks for today and the days ahead.",
    icon: Calendar,
    tone: "peach",
  },
  {
    title: "Try it on",
    body: "See complete outfits on you before you wear them.",
    icon: Sparkles,
    tone: "mint",
  },
  {
    title: "Share your style",
    body: "Invite the people whose opinion you trust.",
    icon: Users,
    tone: "sky",
  },
];

const CHIP: Record<Feature["tone"], string> = {
  lilac: "bg-lilac text-brand-700",
  peach: "bg-peach text-orange-800",
  mint: "bg-mint text-emerald-800",
  sky: "bg-sky text-blue-800",
};

const LIGHT_CARD: Record<Feature["tone"], string> = {
  lilac: "bg-lilac/60 border-brand-200/70",
  peach: "bg-peach/60 border-orange-600/10",
  mint: "bg-mint/60 border-emerald-600/10",
  sky: "bg-sky/60 border-blue-600/10",
};

/** Lifts on hover and on tap — the lift is decoration, never an affordance. */
export function FeatureCard({
  feature,
  variant,
  index = 0,
}: {
  feature: Feature;
  variant: "dark" | "light";
  index?: number;
}) {
  const Icon = feature.icon;
  return (
    <div
      style={{ animationDelay: `${120 + index * 90}ms` }}
      className={[
        "rounded-2xl border p-3.5 h-full animate-rise-in",
        "transition-[transform,background-color,border-color,box-shadow] duration-200",
        "hover:-translate-y-0.5 active:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        variant === "dark"
          ? "bg-white/[0.07] border-white/10 hover:bg-white/[0.12] hover:border-white/20"
          : `${LIGHT_CARD[feature.tone]} hover:shadow-card`,
      ].join(" ")}
    >
      <span className={`w-9 h-9 rounded-xl grid place-items-center ${CHIP[feature.tone]}`}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <h3
        className={`text-sm font-semibold mt-2.5 ${variant === "dark" ? "text-white" : "text-ink"}`}
      >
        {feature.title}
      </h3>
      <p
        className={`text-[12.5px] leading-snug mt-1 ${
          variant === "dark" ? "text-white/65" : "text-ink/70"
        }`}
      >
        {feature.body}
      </p>
    </div>
  );
}

/**
 * Phone-only feature strip. Swiping is native scroll-snap; the dots and the
 * arrow buttons do the same job for anyone who can't or won't swipe.
 */
export function FeatureCarousel() {
  const listRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  const go = useCallback((n: number) => {
    const el = listRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(FEATURES.length - 1, n));
    const child = el.children[clamped] as HTMLElement | undefined;
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: "smooth" });
    setIndex(clamped);
  }, []);

  // Keep the dots honest when the user swipes instead of tapping.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let frame = 0;
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const items = [...el!.children] as HTMLElement[];
        const centre = el!.scrollLeft + el!.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        items.forEach((c, i) => {
          const d = Math.abs(c.offsetLeft - el!.offsetLeft + c.clientWidth / 2 - centre);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        setIndex(best);
      });
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section aria-label="What TryUnex does" className="lg:hidden">
      <ul
        ref={listRef}
        className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-1"
      >
        {FEATURES.map((f, i) => (
          <li key={f.title} className="snap-center shrink-0 w-[74vw] max-w-[18rem]">
            <FeatureCard feature={f} variant="light" index={i} />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-center gap-3 mt-3">
        <IconButton label="Previous benefit" onClick={() => go(index - 1)} disabled={index === 0}>
          <ChevronLeft className="w-5 h-5" />
        </IconButton>

        <div className="flex items-center gap-1.5">
          {FEATURES.map((f, i) => (
            <button
              key={f.title}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${f.title}`}
              aria-current={i === index ? "true" : undefined}
              className="tap-44 p-1"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? "w-5 bg-brand-500" : "w-1.5 bg-ink/20"
                }`}
              />
            </button>
          ))}
        </div>

        <IconButton
          label="Next benefit"
          onClick={() => go(index + 1)}
          disabled={index === FEATURES.length - 1}
        >
          <ChevronRight className="w-5 h-5" />
        </IconButton>
      </div>
    </section>
  );
}

/**
 * A small, static-safe impression of the app: pieces stagger in, a plan card
 * slides in, and the try-on frame crossfades from photo to look. Decorative —
 * hidden from assistive tech, and every animation settles on its final frame
 * under prefers-reduced-motion.
 */
export function ProductPreview() {
  return (
    <div
      aria-hidden
      className="rounded-3xl border border-ink/[0.06] bg-white/80 backdrop-blur shadow-card p-3.5 flex gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-ink/55 font-semibold">
          Your wardrobe
        </p>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {(["lilac", "peach", "mint"] as const).map((tone, i) => (
            <div
              key={tone}
              style={{ animationDelay: `${i * 120}ms` }}
              className={`aspect-square rounded-xl grid place-items-center animate-rise-in ${
                tone === "lilac" ? "bg-lilac" : tone === "peach" ? "bg-peach" : "bg-mint"
              }`}
            >
              <Shirt
                className={`w-5 h-5 ${
                  tone === "lilac"
                    ? "text-brand-600"
                    : tone === "peach"
                      ? "text-orange-700"
                      : "text-emerald-700"
                }`}
              />
            </div>
          ))}
        </div>

        <div
          style={{ animationDelay: "460ms" }}
          className="mt-2.5 flex items-center gap-2 rounded-xl bg-sky/70 px-2.5 py-2 animate-slide-in"
        >
          <Calendar className="w-4 h-4 text-blue-800 shrink-0" />
          <span className="text-[11.5px] font-medium text-blue-900 truncate">
            Friday · 3 pieces planned
          </span>
        </div>
      </div>

      <div className="relative w-24 sm:w-28 shrink-0 rounded-2xl overflow-hidden bg-ink/[0.05]">
        {/* "Before": the plain photo. */}
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-ink/[0.06] to-ink/[0.12]">
          <UserIcon className="w-8 h-8 text-ink/30" />
        </div>
        {/* "After": the generated look, crossfading over it. */}
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-brand-400 to-brand-600 animate-xfade">
          <UserIcon className="w-8 h-8 text-white/90" />
        </div>
        <span className="absolute bottom-1.5 inset-x-1.5 rounded-lg bg-white/90 text-[9.5px] font-semibold text-brand-700 text-center py-1">
          Try-on
        </span>
      </div>
    </div>
  );
}

/** Desktop-only story panel that fills the left half of the card. */
export function HeroPanel() {
  return (
    <aside className="relative hidden lg:flex flex-col justify-center overflow-hidden bg-[#2A1B5E] p-10 xl:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(26rem 20rem at 10% 0%, rgba(155,130,240,0.45), transparent 60%)," +
            "radial-gradient(20rem 16rem at 100% 20%, rgba(255,225,210,0.20), transparent 60%)," +
            "radial-gradient(24rem 20rem at 60% 110%, rgba(207,244,223,0.18), transparent 60%)",
        }}
      />

      <div className="relative">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="w-8 h-8" />
          <span className="text-lg font-bold text-white tracking-tight">TryUnex</span>
        </div>

        <h2 className="text-[34px] xl:text-[38px] font-bold text-white leading-[1.1] tracking-tight mt-8">
          Dress with more joy,
          <br />
          every day.
        </h2>
        <p className="text-[15px] text-white/70 leading-relaxed mt-4 max-w-sm">
          Save your pieces, plan your looks, and try outfits on before you wear them.
        </p>

        <div className="grid grid-cols-2 gap-3 mt-9">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} variant="dark" index={i} />
          ))}
        </div>
      </div>
    </aside>
  );
}
