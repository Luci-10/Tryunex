import type { ReactNode } from "react";
import Photo from "../ui/Photo";
import BeforeAfter from "../marketing/BeforeAfter";
import { Calendar, Camera, Check, Shirt, Sparkles, Tag } from "../ui/icons";

/* ---------------------------------------------------------------- shared */

/**
 * Fades and lifts a section into view once. Purely decorative, so it is
 * disabled wholesale under `prefers-reduced-motion` by the `motion-safe`
 * prefix rather than by a media query in JS.
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

/* ------------------------------------------------------------ value strip */

const VALUES = [
  {
    icon: Shirt,
    tone: "bg-lilac text-brand-700",
    title: "Your wardrobe, organised",
    body: "Every piece in one place, so you can actually see what you own.",
  },
  {
    icon: Sparkles,
    tone: "bg-mint text-emerald-800",
    title: "Try an outfit before you wear it",
    body: "Put a look on yourself and judge it properly, not from a hanger.",
  },
  {
    icon: Tag,
    tone: "bg-peach text-orange-800",
    title: "Give great clothes a second life",
    body: "Pass on what you've stopped wearing, and find pre-loved pieces.",
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

/**
 * Compact previews drawn from the app's own tokens. The brief allows "real
 * image thumbnails or refined UI previews"; previews are used here so the
 * page needs exactly one photographic asset rather than five.
 */
function StepArt({ index }: { index: number }) {
  const frame = "w-full h-24 rounded-xl grid place-items-center overflow-hidden";
  if (index === 0)
    return (
      <div className={`${frame} bg-lilac/70`}>
        <span className="w-14 h-16 rounded-lg border-2 border-dashed border-brand-300 bg-white/80 grid place-items-center text-brand-600">
          <Camera className="w-6 h-6" />
        </span>
      </div>
    );
  if (index === 1)
    return (
      <div className={`${frame} bg-sky/70 gap-1.5 flex items-center`}>
        {["bg-white", "bg-white", "bg-brand-500"].map((c, i) => (
          <span key={i} className={`w-10 h-12 rounded-lg shadow-card ${c}`} />
        ))}
      </div>
    );
  if (index === 2)
    return (
      <div className={`${frame} bg-mint/70 gap-2 flex items-center`}>
        <span className="w-10 h-14 rounded-lg bg-white/90 shadow-card" />
        <Sparkles className="w-4 h-4 text-emerald-700" />
        <span className="w-10 h-14 rounded-lg bg-gradient-to-b from-brand-400 to-brand-600 shadow-card" />
      </div>
    );
  return (
    <div className={`${frame} bg-peach/70`}>
      <span className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 shadow-card">
        <Calendar className="w-4 h-4 text-orange-700" />
        <span className="text-[11.5px] font-semibold text-orange-900">Friday · ready</span>
      </span>
    </div>
  );
}

const STEPS = [
  { title: "Add your clothes", body: "Snap a photo, or pick one from your gallery." },
  { title: "Build a look", body: "Combine pieces and keep them together." },
  { title: "Try it on with AI", body: "See the outfit on you before you commit." },
  { title: "Plan, repeat, or thrift", body: "Save it for a day, or pass it on." },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="space-y-5">
      <SectionTitle eyebrow="How it works" title="Four steps, and you're styled." />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <Reveal delay={i * 60}>
              <div className="h-full rounded-card border border-ink/[0.07] bg-white shadow-card p-3.5">
                <StepArt index={i} />
                <div className="flex items-center gap-2 mt-3">
                  <span className="w-6 h-6 rounded-full bg-brand-500 text-white grid place-items-center text-[11px] font-bold shrink-0">
                    {i + 1}
                  </span>
                  <h3 className="text-[14.5px] font-semibold leading-tight">{s.title}</h3>
                </div>
                <p className="text-[13px] text-ink/65 leading-relaxed mt-1.5">{s.body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
      <h2 id="how-title" className="sr-only">
        How TryUnex works
      </h2>
    </section>
  );
}

/* ---------------------------------------------------------------- features */

function FeatureRow({
  eyebrow,
  title,
  body,
  note,
  media,
  flip,
}: {
  eyebrow: string;
  title: string;
  body: string;
  note?: string;
  media: ReactNode;
  flip?: boolean;
}) {
  return (
    <Reveal>
      <div className="grid gap-5 lg:grid-cols-2 lg:items-center">
        <div className={flip ? "lg:order-2" : ""}>
          <SectionTitle eyebrow={eyebrow} title={title} body={body} />
          {note && (
            <p className="text-[12.5px] text-ink/60 leading-relaxed mt-3 rounded-xl bg-ink/[0.035] px-3.5 py-2.5">
              {note}
            </p>
          )}
        </div>
        <div className={flip ? "lg:order-1" : ""}>{media}</div>
      </div>
    </Reveal>
  );
}

function PlanPreview() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="rounded-card border border-ink/[0.07] bg-white shadow-card p-4">
      <div className="flex gap-1.5">
        {days.map((d, i) => (
          <span
            key={i}
            className={`flex-1 h-9 rounded-lg grid place-items-center text-[12px] font-semibold ${
              i === 4 ? "bg-brand-500 text-white" : "bg-ink/[0.05] text-ink/55"
            }`}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-peach/60 p-3">
        <p className="text-[12px] font-semibold text-orange-900">Friday · 3 pieces planned</p>
        <div className="flex gap-2 mt-2">
          {["bg-lilac", "bg-mint", "bg-sky"].map((c, i) => (
            <span key={i} className={`flex-1 h-14 rounded-lg ${c}`} />
          ))}
        </div>
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

export function Features() {
  return (
    <section aria-label="What you can do" className="space-y-10 sm:space-y-14">
      <FeatureRow
        eyebrow="AI virtual try-on"
        title="See your selected look before you wear it."
        body="Add a photo of yourself once, pick the pieces, and preview the whole outfit together."
        note="Virtual try-on is a styling preview; fit and sizing may vary."
        media={
          <BeforeAfter
            beforeFallback={<div className="w-full h-full bg-ink/[0.06]" />}
            afterFallback={<div className="w-full h-full bg-gradient-to-b from-brand-400 to-brand-600" />}
          />
        }
      />
      <FeatureRow
        flip
        eyebrow="Outfit planning"
        title="Make mornings easier with looks planned ahead."
        body="Choose a day, save the outfit, and stop deciding at 8am."
        media={<PlanPreview />}
      />
      <FeatureRow
        eyebrow="Thrift marketplace"
        title="Pass on pieces you no longer wear, and discover new favourites."
        body="List straight from your wardrobe, browse what others are letting go, and message the seller."
        media={<ThriftPreview />}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- hero art */

/** Chips sit outside the photo's focal area so the person is never covered. */
export function HeroArt() {
  return (
    <div className="relative">
      <Photo
        slot="landing-hero"
        priority
        rounded="rounded-[28px]"
        className="border border-ink/[0.07] shadow-lift"
        fallback={
          <div
            aria-hidden
            className="w-full h-full bg-gradient-to-br from-lilac via-white to-peach grid place-items-center"
          >
            <Sparkles className="w-10 h-10 text-brand-400" />
          </div>
        }
      />

      <Chip className="left-3 top-4 sm:-left-3" tone="bg-white">
        <Check className="w-3.5 h-3.5 text-emerald-700" />
        Look ready
      </Chip>
      <Chip className="right-3 top-1/3 sm:-right-3" tone="bg-white">
        <Shirt className="w-3.5 h-3.5 text-brand-600" />
        Top + trousers
      </Chip>
      <Chip className="left-4 bottom-5 sm:-left-2" tone="bg-brand-500 text-white">
        <Sparkles className="w-3.5 h-3.5" />
        1 credit
      </Chip>
    </div>
  );
}

function Chip({
  children,
  className = "",
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone: string;
}) {
  return (
    <span
      aria-hidden
      className={`absolute ${className} ${tone} inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold shadow-lift border border-ink/[0.06] motion-safe:animate-rise-in`}
    >
      {children}
    </span>
  );
}
