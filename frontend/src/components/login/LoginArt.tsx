import { useCallback, useEffect, useRef, useState } from "react";
import IconButton from "../ui/IconButton";
import Photo from "../ui/Photo";
import BeforeAfter from "../marketing/BeforeAfter";
import type { SlotName } from "../../marketing/assets";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Close,
  Shirt,
  Sparkles,
  UserIcon,
  Users,
} from "../ui/icons";

type Tone = "lilac" | "peach" | "mint" | "sky";

type Feature = {
  title: string;
  body: string;
  icon: typeof Shirt;
  tone: Tone;
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

const CHIP: Record<Tone, string> = {
  lilac: "bg-lilac text-brand-700",
  peach: "bg-peach text-orange-800",
  mint: "bg-mint text-emerald-800",
  sky: "bg-sky text-blue-800",
};

const BLOCK: Record<Tone, string> = {
  lilac: "bg-lilac text-brand-600",
  peach: "bg-peach text-orange-700",
  mint: "bg-mint text-emerald-700",
  sky: "bg-sky text-blue-700",
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------------------ scenes */

/**
 * Each scene leads with a photograph; the token-drawn version is kept only as
 * <Photo>'s fallback so a missing asset degrades instead of leaving a hole.
 */
function Scene({ index }: { index: number }) {
  if (index === 1) return <PlanScene />;
  if (index === 2) return <TryOnScene />;
  if (index === 3) return <ShareScene />;
  return <WardrobeScene />;
}

/** Photo filling a scene slot, with the old drawing behind it as fallback. */
function ScenePhoto({ slot, fallback }: { slot: SlotName; fallback: React.ReactNode }) {
  return (
    <Photo
      slot={slot}
      fill
      fallback={fallback}
      rounded="rounded-xl"
    />
  );
}

function SceneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink/55 mb-2.5">
      {children}
    </p>
  );
}

/** Every scene fills its frame exactly, so switching never shifts the page. */
function SceneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      <SceneLabel>{label}</SceneLabel>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

function WardrobeScene() {
  const tones: Tone[] = ["lilac", "peach", "mint", "sky", "lilac", "mint"];
  return (
    <SceneFrame label="12 pieces · 8 clean">
      <ScenePhoto
        slot="login-wardrobe"
        fallback={
          <div className="grid grid-cols-3 grid-rows-2 gap-2 w-full h-full">
            {tones.map((t, i) => (
              <div
                key={i}
                style={{ animationDelay: `${i * 70}ms` }}
                className={`rounded-xl grid place-items-center animate-rise-in ${BLOCK[t]}`}
              >
                <Shirt className="w-5 h-5" />
              </div>
            ))}
          </div>
        }
      />
    </SceneFrame>
  );
}

function PlanScene() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <SceneFrame label="This week">
      <div className="flex gap-1.5 shrink-0">
        {days.map((d, i) => (
          <span
            key={i}
            style={{ animationDelay: `${i * 45}ms` }}
            className={`flex-1 h-8 rounded-lg grid place-items-center text-[11px] font-semibold animate-rise-in ${
              i === 4 ? "bg-brand-500 text-white" : "bg-ink/[0.05] text-ink/55"
            }`}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex-1 min-h-0">
        <ScenePhoto
          slot="login-plan"
          fallback={
            <div className="rounded-xl bg-peach/70 p-2.5 w-full h-full flex flex-col">
              <p className="text-[11px] font-semibold text-orange-900 shrink-0">
                Friday · 3 pieces planned
              </p>
              <div className="flex gap-2 mt-2 flex-1 min-h-0">
                {(["lilac", "mint", "sky"] as Tone[]).map((t, i) => (
                  <span key={i} className={`flex-1 rounded-lg grid place-items-center ${BLOCK[t]}`}>
                    <Shirt className="w-4 h-4" />
                  </span>
                ))}
              </div>
            </div>
          }
        />
      </div>
    </SceneFrame>
  );
}

function TryOnScene() {
  return (
    <SceneFrame label="Drag to compare">
      <BeforeAfter
        fill
        beforeFallback={
          <div className="w-full h-full grid place-items-center bg-gradient-to-b from-ink/[0.05] to-ink/[0.12]">
            <UserIcon className="w-9 h-9 text-ink/30" />
          </div>
        }
        afterFallback={
          <div className="w-full h-full grid place-items-center bg-gradient-to-b from-brand-400 to-brand-600">
            <UserIcon className="w-9 h-9 text-white/90" />
          </div>
        }
      />
    </SceneFrame>
  );
}

function ShareScene() {
  return (
    <SceneFrame label="A friend suggests">
      <ScenePhoto
        slot="login-share"
        fallback={
          <div className="w-full h-full flex flex-col">
            <div className="rounded-xl bg-sky/60 p-2.5 flex-1 min-h-0 flex flex-col animate-rise-in">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-7 h-7 rounded-full bg-brand-500 text-white grid place-items-center text-[10px] font-bold shrink-0">
                  PN
                </span>
                <p className="text-[11.5px] font-semibold text-blue-900 truncate">
                  Priya picked a look for Friday
                </p>
              </div>
              <div className="flex gap-2 mt-2.5 flex-1 min-h-0">
                {(["lilac", "peach", "mint"] as Tone[]).map((t, i) => (
                  <span
                    key={i}
                    style={{ animationDelay: `${100 + i * 90}ms` }}
                    className={`flex-1 rounded-lg grid place-items-center animate-rise-in ${BLOCK[t]}`}
                  >
                    <Shirt className="w-4 h-4" />
                  </span>
                ))}
              </div>
            </div>
            <div
              style={{ animationDelay: "380ms" }}
              className="flex gap-2 mt-2.5 shrink-0 animate-slide-in"
            >
              <span className="flex-1 h-8 rounded-lg bg-brand-500 text-white text-[11px] font-semibold grid place-items-center">
                <span className="flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Accept
                </span>
              </span>
              <span className="flex-1 h-8 rounded-lg bg-ink/[0.05] text-ink/65 text-[11px] font-semibold grid place-items-center">
                <span className="flex items-center gap-1">
                  <Close className="w-3.5 h-3.5" />
                  Not today
                </span>
              </span>
            </div>
          </div>
        }
      />
    </SceneFrame>
  );
}

/* ------------------------------------------------------------- feature card */

function FeatureButton({
  feature,
  active,
  variant,
  onSelect,
}: {
  feature: Feature;
  active: boolean;
  variant: "dark" | "light";
  onSelect: () => void;
}) {
  const Icon = feature.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={[
        "w-full h-full text-left rounded-2xl border p-3",
        "transition-[transform,background-color,border-color,box-shadow] duration-200",
        "hover:-translate-y-0.5 active:-translate-y-0.5 motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0",
        variant === "dark"
          ? active
            ? "bg-white/[0.16] border-white/25 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
            : "bg-white/[0.06] border-white/10 hover:bg-white/[0.11]"
          : active
            ? "bg-white border-brand-400 shadow-card"
            : "bg-white/70 border-ink/[0.07] hover:bg-white",
      ].join(" ")}
    >
      <span className="flex gap-2.5">
        <span
          className={`w-9 h-9 shrink-0 rounded-xl grid place-items-center ${CHIP[feature.tone]}`}
        >
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <span className="min-w-0">
          <span
            className={`block text-[13.5px] font-semibold leading-tight ${
              variant === "dark" ? "text-white" : "text-ink"
            }`}
          >
            {feature.title}
          </span>
          <span
            className={`block text-[12px] leading-snug mt-1 ${
              variant === "dark" ? "text-white/65" : "text-ink/70"
            }`}
          >
            {feature.body}
          </span>
        </span>
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- showcase */

function useShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Cycles on its own so the page has life, and stops for good the moment
  // someone takes control. Never auto-advances under reduced motion.
  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const t = setInterval(() => setActive((a) => (a + 1) % FEATURES.length), 4500);
    return () => clearInterval(t);
  }, [paused]);

  const select = useCallback((i: number) => {
    setPaused(true);
    setActive(((i % FEATURES.length) + FEATURES.length) % FEATURES.length);
  }, []);

  return { active, select, setActive, paused };
}

/** Desktop: the whole left panel — story, live scene, and the four cards. */
export function HeroPanel() {
  const { active, select } = useShowcase();

  return (
    <aside className="relative hidden lg:flex flex-col justify-center overflow-hidden bg-[#2A1B5E] p-8 xl:p-10">
      {/* The hero photograph fills the panel. It is the one marketing image
          above the fold, so it loads eagerly; everything else is lazy. The
          deep plum ground stays behind it as the backdrop for the fallback
          and for the moments before the image decodes. */}
      <div className="absolute inset-0">
        <Photo slot="login-hero" priority fill rounded="rounded-none" alt="" />
      </div>

      {/* Scrim. The panel carries white text across its whole height, and the
          photo behind it is not known at build time, so this keeps a hard
          contrast floor rather than trusting the crop: never lighter than
          ~50% plum, heaviest at the bottom where the feature cards sit. The
          hero therefore reads as a tinted backdrop, which is deliberate. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(26rem 20rem at 8% -4%, rgba(155,130,240,0.38), transparent 60%)," +
            "radial-gradient(20rem 16rem at 100% 18%, rgba(255,225,210,0.16), transparent 60%)," +
            "radial-gradient(24rem 20rem at 60% 108%, rgba(207,244,223,0.14), transparent 60%)," +
            "linear-gradient(to top, rgba(26,15,62,0.94) 0%, rgba(30,18,70,0.82) 42%, rgba(38,24,86,0.72) 100%)",
        }}
      />

      <div className="relative">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="w-8 h-8" />
          <span className="text-lg font-bold text-white tracking-tight">TryUnex</span>
        </div>

        <h2 className="text-[32px] xl:text-[36px] font-bold text-white leading-[1.1] tracking-tight mt-6">
          Dress with more joy,
          <br />
          every day.
        </h2>
        <p className="text-[14.5px] text-white/70 leading-relaxed mt-3 max-w-sm">
          Save your pieces, plan your looks, and try outfits on before you wear them.
        </p>

        <div className="mt-6 rounded-2xl bg-white/95 p-3.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)]">
          {/* Fixed height so switching scenes never shifts the layout. */}
          <div key={active} className="h-[172px] animate-fade-in">
            <Scene index={active} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-4">
          {FEATURES.map((f, i) => (
            <FeatureButton
              key={f.title}
              feature={f}
              variant="dark"
              active={i === active}
              onSelect={() => select(i)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

/**
 * Phone/tablet: the same scene, with the four cards as a swipeable strip.
 * Swiping, the dots, and the arrows all drive the same selection — none of
 * them is the only way in.
 */
export function MobileShowcase() {
  const { active, select, setActive } = useShowcase();
  const listRef = useRef<HTMLUListElement>(null);
  const programmatic = useRef(false);

  // Keep the strip in step with whichever card is showing.
  useEffect(() => {
    const el = listRef.current;
    const child = el?.children[active] as HTMLElement | undefined;
    if (!el || !child) return;
    programmatic.current = true;
    el.scrollTo({
      left: child.offsetLeft - el.offsetLeft,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    const t = setTimeout(() => {
      programmatic.current = false;
    }, 500);
    return () => clearTimeout(t);
  }, [active]);

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
        // A swipe counts as taking control; our own scrollTo doesn't.
        if (programmatic.current) setActive(best);
        else select(best);
      });
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [select, setActive]);

  return (
    <section aria-label="What TryUnex does" className="lg:hidden">
      <div className="rounded-3xl border border-ink/[0.06] bg-white/85 backdrop-blur shadow-card p-3.5">
        <div key={active} className="h-[176px] animate-fade-in">
          <Scene index={active} />
        </div>
      </div>

      <ul
        ref={listRef}
        className="flex gap-2.5 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 mt-3 pb-1"
      >
        {FEATURES.map((f, i) => (
          <li key={f.title} className="snap-center shrink-0 w-[70vw] max-w-[17rem]">
            <FeatureButton
              feature={f}
              variant="light"
              active={i === active}
              onSelect={() => select(i)}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-center gap-3 mt-2.5">
        <IconButton label="Previous benefit" onClick={() => select(active - 1)}>
          <ChevronLeft className="w-5 h-5" />
        </IconButton>
        <div className="flex items-center gap-1.5">
          {FEATURES.map((f, i) => (
            <button
              key={f.title}
              type="button"
              onClick={() => select(i)}
              aria-label={`Show ${f.title}`}
              aria-current={i === active ? "true" : undefined}
              className="tap-44 p-1"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-200 ${
                  i === active ? "w-5 bg-brand-500" : "w-1.5 bg-ink/20"
                }`}
              />
            </button>
          ))}
        </div>
        <IconButton label="Next benefit" onClick={() => select(active + 1)}>
          <ChevronRight className="w-5 h-5" />
        </IconButton>
      </div>
    </section>
  );
}

/** Three compact steps under the form — fills the column, sets expectations. */
export function HowItWorks() {
  const steps = [
    { n: 1, title: "Add your pieces", body: "Snap a photo — that's the whole setup." },
    { n: 2, title: "Plan or try on", body: "Build a look, or see it on you first." },
    { n: 3, title: "Share when you want", body: "Only with the people you invite." },
  ];
  return (
    <ol className="space-y-2.5">
      {steps.map((s) => (
        <li key={s.n} className="flex gap-3">
          <span className="w-6 h-6 shrink-0 rounded-full bg-lilac text-brand-700 grid place-items-center text-[11px] font-bold">
            {s.n}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold leading-tight">{s.title}</span>
            <span className="block text-[12.5px] text-ink/65 leading-snug mt-0.5">{s.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
