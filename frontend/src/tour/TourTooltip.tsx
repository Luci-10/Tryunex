import { useEffect, useRef, useState } from "react";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import { Close } from "../components/ui/icons";
import type { TourStep } from "./steps";

/**
 * The instruction card. Sits above or below the target depending on room, is
 * clamped inside the viewport, and keeps clear of the phone tab bar and the
 * home indicator.
 */
export default function TourTooltip({
  step,
  rect,
  index,
  total,
  onSkip,
  onClose,
}: {
  step: TourStep;
  rect: DOMRect | null;
  index: number;
  total: number;
  onSkip: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 12;
    // Clearance for the bottom tab bar plus the Capacitor home indicator.
    const bottomSafe = 96;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!rect) {
      setPos({ top: Math.max(margin, vh / 2 - h / 2), left: Math.max(margin, vw / 2 - w / 2) });
      return;
    }
    const below = rect.bottom + margin;
    const above = rect.top - h - margin;
    const top = below + h + bottomSafe < vh ? below : Math.max(margin, above);
    const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - w / 2), vw - w - margin);
    setPos({ top, left });
  }, [rect, step.id]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-live="polite"
      aria-label={`Step ${index + 1} of ${total}: ${step.title}`}
      className="fixed z-[82] w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl bg-white shadow-lift border border-ink/10 p-3.5 animate-sheet-up"
      style={pos ? { top: pos.top, left: pos.left } : { opacity: 0, top: 0, left: 0 }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
            Step {index + 1} of {total}
          </p>
          <h2 className="text-[15px] font-semibold mt-0.5">{step.title}</h2>
          <p className="text-[13px] text-ink/70 leading-snug mt-1">{step.text}</p>
        </div>
        <IconButton label="Close the tour" onClick={onClose}>
          <Close className="w-4 h-4" />
        </IconButton>
      </div>

      <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-lilac px-2.5 py-1 text-[12px] font-semibold text-brand-700">
        <span aria-hidden>👉</span>
        {step.instruction}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="tap-44 text-[12.5px] text-ink/60 hover:text-ink underline underline-offset-2"
        >
          Skip walkthrough
        </button>
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-4 bg-brand-500" : i < index ? "w-1.5 bg-brand-300" : "w-1.5 bg-ink/15"
              }`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

/** Shown once the last step is done. */
export function TourComplete({ onWardrobe, onDone }: { onWardrobe: () => void; onDone: () => void }) {
  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:inset-x-auto md:right-6 md:bottom-6 md:w-[22rem] z-[82] rounded-2xl bg-white shadow-lift border border-ink/10 p-4 animate-sheet-up">
      <h2 className="text-[16px] font-semibold">You're ready to style</h2>
      <p className="text-[13px] text-ink/70 leading-snug mt-1">
        Add clothes, build looks, plan outfits, and ask your stylist anytime.
      </p>
      <div className="flex gap-2 mt-3">
        <Button size="sm" block onClick={onWardrobe}>
          Go to wardrobe
        </Button>
        <Button size="sm" variant="secondary" block onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
