import type { ReactNode } from "react";
import Photo from "../components/ui/Photo";
import BeforeAfter from "../components/marketing/BeforeAfter";
import { Calendar, Camera, Chat, Shirt, Sparkles, UserIcon } from "../components/ui/icons";

/**
 * Each slide leads with a real photograph from /images/marketing/. The
 * token-drawn artwork below is kept only as <Photo>'s fallback, so a slot
 * whose file has not landed yet degrades to the old illustration instead of an
 * empty frame. Nothing here touches a customer's wardrobe.
 *
 * Only the first slide's photo loads eagerly; the rest are lazy, since the
 * walkthrough is a one-at-a-time modal.
 */
function Frame({ children, tone = "lilac" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    lilac: "from-lilac via-lilac/60 to-white border-brand-200/70",
    peach: "from-peach via-peach/60 to-white border-orange-600/10",
    mint: "from-mint via-mint/60 to-white border-emerald-600/10",
    sky: "from-sky via-sky/60 to-white border-blue-600/10",
  };
  return (
    <div
      aria-hidden
      className={`w-full h-full border bg-gradient-to-br ${tones[tone]} p-4 grid place-items-center overflow-hidden`}
    >
      {children}
    </div>
  );
}

const TILE: Record<string, string> = {
  lilac: "bg-lilac text-brand-600",
  peach: "bg-peach text-orange-700",
  mint: "bg-mint text-emerald-700",
  sky: "bg-sky text-blue-700",
};

function Tile({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`w-12 h-12 rounded-xl grid place-items-center shadow-card ${TILE[tone]}`}>
      {children}
    </span>
  );
}

export type Slide = {
  id: string;
  title: string;
  text: string;
  note?: string;
  art: ReactNode;
};

export const SLIDES: Slide[] = [
  {
    id: "welcome",
    title: "Welcome to TryUnex",
    text: "Your personal space to organise clothes, create outfits, and wear more of what you already own.",
    art: (
      <Photo
        slot="slide-welcome"
        priority
        fallback={
          <Frame>
            <div className="grid grid-cols-3 gap-2.5">
              {["lilac", "peach", "mint", "sky", "lilac", "mint"].map((t, i) => (
                <Tile key={i} tone={t}>
                  <Shirt className="w-5 h-5" />
                </Tile>
              ))}
            </div>
          </Frame>
        }
      />
    ),
  },
  {
    id: "add",
    title: "Add the clothes you own",
    text: "Take a photo or choose one from your gallery. Add a name, category, and style tag.",
    art: (
      <Photo
        slot="slide-add"
        fallback={
          <Frame tone="peach">
            <div className="flex items-center gap-3">
              <span className="w-20 h-24 rounded-xl border-2 border-dashed border-brand-300 bg-white/70 grid place-items-center text-brand-600">
                <Camera className="w-7 h-7" />
              </span>
              <span className="space-y-1.5">
                <span className="block w-24 h-3 rounded-full bg-white/80" />
                <span className="block w-16 h-3 rounded-full bg-white/60" />
                <span className="block w-20 h-6 rounded-full bg-brand-500/90" />
              </span>
            </div>
          </Frame>
        }
      />
    ),
  },
  {
    id: "look",
    title: "Pick clothes for your look",
    text: "Choose items from your wardrobe and keep them together in your selected Try-on look.",
    art: (
      <Photo
        slot="slide-look"
        fallback={
          <Frame tone="mint">
            <div className="flex gap-2.5">
              <Tile tone="lilac"><Shirt className="w-5 h-5" /></Tile>
              <Tile tone="peach"><Shirt className="w-5 h-5" /></Tile>
              <Tile tone="sky"><Shirt className="w-5 h-5" /></Tile>
              <Tile tone="mint"><Sparkles className="w-5 h-5" /></Tile>
            </div>
          </Frame>
        }
      />
    ),
  },
  {
    id: "tryon",
    title: "Preview your outfit",
    text: "Add your photo and create a virtual Try-on preview before you wear the look.",
    // The caveat lives here rather than under the slider so the slide has one
    // disclaimer, not two saying the same thing.
    note: "AI previews help with styling. Fit, sizing, and fabric details may vary.",
    art: (
      <BeforeAfter
        compact
        disclaimer={null}
        beforeFallback={
          <Frame tone="sky">
            <span className="w-16 h-24 rounded-xl bg-ink/[0.08] grid place-items-center text-ink/30">
              <UserIcon className="w-7 h-7" />
            </span>
          </Frame>
        }
        afterFallback={
          <Frame tone="lilac">
            <span className="w-16 h-24 rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 grid place-items-center text-white/90">
              <UserIcon className="w-7 h-7" />
            </span>
          </Frame>
        }
      />
    ),
  },
  {
    id: "plan",
    title: "Plan what to wear",
    text: "Choose a date and save outfits for later. Worn clothes are easy to track too.",
    art: (
      <Photo
        slot="slide-plan"
        fallback={
          <Frame tone="peach">
            <div className="w-full max-w-[15rem]">
              <div className="flex gap-1.5">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span
                    key={i}
                    className={`flex-1 h-8 rounded-lg grid place-items-center text-[11px] font-semibold ${
                      i === 4 ? "bg-brand-500 text-white" : "bg-white/70 text-ink/55"
                    }`}
                  >
                    {d}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2.5 rounded-xl bg-white/80 px-2.5 py-2">
                <Calendar className="w-4 h-4 text-orange-700 shrink-0" />
                <span className="text-[11.5px] font-medium text-orange-900">Friday · 3 pieces</span>
              </div>
            </div>
          </Frame>
        }
      />
    ),
  },
  {
    id: "chat",
    title: "Need outfit ideas?",
    text: "Ask your AI stylist for suggestions using the clothes in your wardrobe.",
    art: (
      <Photo
        slot="slide-chat"
        fallback={
          <Frame>
            <div className="w-full max-w-[15rem] space-y-2">
              <span className="block ml-auto w-32 h-7 rounded-2xl rounded-br-md bg-brand-500" />
              <span className="flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-lilac text-brand-600 grid place-items-center shrink-0">
                  <Chat className="w-3.5 h-3.5" />
                </span>
                <span className="flex gap-1.5">
                  <Tile tone="lilac"><Shirt className="w-4 h-4" /></Tile>
                  <Tile tone="mint"><Shirt className="w-4 h-4" /></Tile>
                </span>
              </span>
            </div>
          </Frame>
        }
      />
    ),
  },
  {
    id: "ready",
    title: "You're ready",
    text: "Start by adding your first piece, then build looks your way.",
    art: (
      <Photo
        slot="slide-ready"
        fallback={
          <Frame tone="mint">
            <span className="w-16 h-16 rounded-full bg-white/80 grid place-items-center text-brand-600 shadow-card">
              <Sparkles className="w-8 h-8" />
            </span>
          </Frame>
        }
      />
    ),
  },
];
