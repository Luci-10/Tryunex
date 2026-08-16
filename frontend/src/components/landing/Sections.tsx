import type { ReactNode } from "react";
import Photo from "../ui/Photo";
import type { SlotName } from "../../marketing/assets";
import { Calendar, Camera, Check, Search, Shirt, Sparkles, Tag } from "../ui/icons";

/* ---------------------------------------------------------------- shared */

/**
 * Fades and lifts content into view. Decorative only, so it is disabled
 * wholesale under `prefers-reduced-motion` via the `motion-safe` prefix
 * rather than a media query in JS.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`motion-safe:animate-rise-in ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

function SectionTitle({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">{eyebrow}</p>
      )}
      <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight leading-[1.15] mt-1.5">
        {title}
      </h2>
      {body && <p className="text-[15px] text-ink/70 leading-relaxed mt-2.5">{body}</p>}
    </div>
  );
}

/**
 * The illustrations sit on a pale tinted panel with generous padding, so the
 * artwork is never cropped and never has UI laid over the characters.
 * `object-contain` is deliberate: `cover` would crop these.
 */
function IllustrationPanel({
  slot,
  tone,
  priority,
  className = "",
}: {
  slot: SlotName;
  tone: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] border border-ink/[0.07] shadow-card p-4 sm:p-6 ${tone} ${className}`}
    >
      <Photo
        slot={slot}
        priority={priority}
        rounded="rounded-2xl"
        // `contain` because these illustrations must never be cropped, and
        // `multiply` so their white background dissolves into the tinted panel
        // instead of sitting on it as a white rectangle.
        className="bg-transparent [&_img]:object-contain [&_img]:mix-blend-multiply"
        fallback={
          <div aria-hidden className="w-full h-full grid place-items-center">
            <Sparkles className="w-10 h-10 text-brand-400" />
          </div>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

export function HeroArt() {
  return (
    <div className="relative">
      <IllustrationPanel slot="landing-fitting" tone="bg-lilac/55" priority />
      {/* Outside the artwork's centre, so no character is covered. */}
      <Chip className="-left-1 top-6 sm:-left-3" tone="bg-white">
        <Shirt className="w-3.5 h-3.5 text-brand-600" />
        Top + trousers
      </Chip>
      <Chip className="-right-1 bottom-8 sm:-right-3" tone="bg-brand-500 text-white">
        <Sparkles className="w-3.5 h-3.5" />
        Try it on · 1 credit
      </Chip>
    </div>
  );
}

function Chip({ children, className = "", tone }: { children: ReactNode; className?: string; tone: string }) {
  return (
    <span
      aria-hidden
      className={`absolute ${className} ${tone} inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold shadow-lift border border-ink/[0.06] motion-safe:animate-rise-in`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ value strip */

const VALUES = [
  {
    icon: Shirt,
    tone: "bg-lilac text-brand-700",
    title: "Your wardrobe, organised",
    body: "Keep every piece in one easy digital wardrobe.",
  },
  {
    icon: Sparkles,
    tone: "bg-sky text-blue-800",
    title: "See looks before you wear them",
    body: "Select clothes and preview a virtual outfit.",
  },
  {
    icon: Tag,
    tone: "bg-mint text-emerald-800",
    title: "Wear better, waste less",
    body: "Plan outfits and give good clothes a second life.",
  },
];

export function ValueStrip() {
  return (
    <section aria-label="What TryUnex gives you" className="grid gap-3 sm:grid-cols-3">
      {VALUES.map((v, i) => {
        const Icon = v.icon;
        return (
          <Reveal key={v.title} delay={i * 70}>
            <div className="h-full rounded-card border border-ink/[0.07] bg-white shadow-card p-4">
              <span className={`w-10 h-10 rounded-xl grid place-items-center ${v.tone}`}>
                <Icon className="w-5 h-5" />
              </span>
              <h3 className="text-[15px] font-semibold leading-tight mt-3">{v.title}</h3>
              <p className="text-[13.5px] text-ink/65 leading-relaxed mt-1.5">{v.body}</p>
            </div>
          </Reveal>
        );
      })}
    </section>
  );
}

/* ----------------------------------------------------------- how it works */

const STEPS = [
  {
    icon: Camera,
    title: "Add your clothes",
    body: "Upload a clear photo and add details like category, colour, and style.",
  },
  {
    icon: Shirt,
    title: "Build your look",
    body: "Choose tops, bottoms, dresses, layers, and accessories from your wardrobe.",
  },
  {
    icon: Sparkles,
    title: "Try it on",
    body: "Preview your selected outfit with AI before you wear it.",
  },
  {
    icon: Calendar,
    title: "Plan or pass it on",
    body: "Save looks for later or list clothing you no longer wear in Thrift.",
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="space-y-6">
      <SectionTitle eyebrow="How it works" title="From wardrobe to outfit in minutes." />
      <span id="how-title" className="sr-only">
        How TryUnex works
      </span>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <IllustrationPanel slot="landing-wardrobe" tone="bg-sky/45" />
        </Reveal>

        <ol className="space-y-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={s.title}>
                <Reveal delay={i * 60}>
                  <div className="flex gap-3 rounded-card border border-ink/[0.07] bg-white shadow-card p-3.5">
                    <span className="w-9 h-9 shrink-0 rounded-xl bg-lilac text-brand-700 grid place-items-center">
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14.5px] font-semibold leading-tight">
                        <span className="text-brand-600">{i + 1}.</span> {s.title}
                      </h3>
                      <p className="text-[13px] text-ink/65 leading-relaxed mt-1">{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="text-[12.5px] text-ink/60 leading-relaxed rounded-xl bg-ink/[0.035] border border-ink/[0.06] px-3.5 py-2.5">
        AI try-on is a visual styling preview. Fit and size may vary.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- features */

function FeatureRow({
  eyebrow,
  title,
  body,
  extra,
  media,
  flip,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  extra?: string;
  media: ReactNode;
  flip?: boolean;
  action?: ReactNode;
}) {
  return (
    <Reveal>
      <div className="grid gap-5 lg:grid-cols-2 lg:items-center">
        <div className={flip ? "lg:order-2" : ""}>
          <SectionTitle eyebrow={eyebrow} title={title} body={body} />
          {extra && <p className="text-[13px] text-ink/60 mt-2.5">{extra}</p>}
          {action && <div className="mt-4">{action}</div>}
        </div>
        <div className={flip ? "lg:order-1" : ""}>{media}</div>
      </div>
    </Reveal>
  );
}

function WardrobePreview() {
  const rows = [
    { label: "Tops", tone: "bg-lilac", n: 12 },
    { label: "Bottoms", tone: "bg-sky", n: 8 },
    { label: "Outerwear", tone: "bg-peach", n: 4 },
  ];
  return (
    <div className="rounded-card border border-ink/[0.07] bg-white shadow-card p-4">
      <div className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 h-10">
        <Search className="w-4 h-4 text-ink/45" />
        <span className="text-[13px] text-ink/45">Search your wardrobe</span>
      </div>
      <div className="space-y-2 mt-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5">
            <span className={`w-10 h-10 rounded-lg ${r.tone}`} />
            <span className="text-[13.5px] font-medium flex-1">{r.label}</span>
            <span className="text-[12px] text-ink/55">{r.n} pieces</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LookPreview() {
  return (
    <div className="rounded-card border border-ink/[0.07] bg-white shadow-card p-4">
      <div className="flex gap-2">
        {["bg-lilac", "bg-sky", "bg-mint"].map((c, i) => (
          <span key={i} className={`flex-1 h-24 rounded-xl ${c} relative`}>
            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/90 grid place-items-center">
              <Check className="w-3 h-3 text-emerald-700" />
            </span>
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-[13px] font-medium">3 items selected</span>
        <span className="rounded-full bg-brand-500 text-white text-[12px] font-semibold px-2.5 py-1">
          1 credit
        </span>
      </div>
    </div>
  );
}

function ThriftPreview() {
  return (
    <div className="rounded-card border border-ink/[0.07] bg-white shadow-card p-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { tone: "bg-lilac", price: "₹499", label: "Denim jacket" },
          { tone: "bg-mint", price: "₹320", label: "Linen shirt" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl overflow-hidden border border-ink/[0.06]">
            <div className={`h-24 ${c.tone} relative`}>
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold">
                {c.price}
              </span>
            </div>
            <p className="text-[12px] font-medium px-2 py-1.5 truncate">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-[12px] text-ink/60 mt-3">
        <Check className="w-3.5 h-3.5 text-emerald-700" />
        Buyer and seller arrange it directly.
      </p>
    </div>
  );
}

export function Features({ onExploreThrift }: { onExploreThrift: () => void }) {
  return (
    <div className="space-y-12 sm:space-y-16">
      <section id="feature-wardrobe" tabIndex={-1} className="scroll-mt-20 outline-none">
        <FeatureRow
          eyebrow="Digital wardrobe"
          title="A wardrobe that remembers everything."
          body="Find your clothes by category, colour, season, occasion, or style—without opening every cupboard."
          media={<WardrobePreview />}
        />
      </section>

      <section id="feature-tryon" tabIndex={-1} className="scroll-mt-20 outline-none">
        <FeatureRow
          flip
          eyebrow="AI try-on"
          title="Try the look, not the guesswork."
          body="Choose up to three clothing pieces for one credit and preview how the look comes together."
          extra="Up to 5 pieces can be styled in a look."
          media={<LookPreview />}
        />
      </section>

      <section id="feature-thrift" tabIndex={-1} className="scroll-mt-20 outline-none">
        <FeatureRow
          eyebrow="Thrift"
          title="A better home for clothes you no longer wear."
          body="List pre-loved pieces from your wardrobe and discover thoughtful second-hand finds."
          media={<ThriftPreview />}
          action={
            <button
              type="button"
              onClick={onExploreThrift}
              className="tap-44 inline-flex items-center gap-1.5 h-11 px-4 rounded-full border border-brand-300 text-[14px] font-semibold text-brand-700 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Tag className="w-4 h-4" />
              Explore Thrift
            </button>
          }
        />
      </section>
    </div>
  );
}
