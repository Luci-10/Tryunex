import { useId, useState, type ReactNode } from "react";
import Photo from "../ui/Photo";
import { DEMO_DISCLAIMER } from "../../marketing/assets";

/**
 * The try-on demo: one model, two outfits, wiped between by a draggable
 * divider.
 *
 * The divider is a real <input type="range"> stretched invisibly across the
 * frame. That is deliberate — it gives pointer dragging, click-to-jump, arrow
 * keys, Home/End and a correct screen-reader announcement without any custom
 * pointer maths, and `touch-action: pan-y` lets a vertical swipe scroll the
 * page instead of being swallowed by the control.
 *
 * Both frames are the same licensed demo model. The labels and the disclaimer
 * are not optional decoration: they are what stops this reading as a real
 * customer result.
 */
export default function BeforeAfter({
  beforeFallback,
  afterFallback,
  className = "",
  compact = false,
  fill = false,
  disclaimer = DEMO_DISCLAIMER,
}: {
  beforeFallback?: ReactNode;
  afterFallback?: ReactNode;
  className?: string;
  /** Tighter labels and type, for the walkthrough card. */
  compact?: boolean;
  /** Fill a parent that already has a definite height, instead of using the 3:4 ratio. */
  fill?: boolean;
  /** Pass null where surrounding copy already carries the caveat. */
  disclaimer?: string | null;
}) {
  const [pos, setPos] = useState(50);
  const id = useId();

  const label = compact
    ? "text-[10px] px-1.5 py-0.5"
    : "text-[11px] px-2 py-1";

  return (
    <figure className={`${className} ${fill ? "h-full flex flex-col min-h-0" : ""}`}>
      <div
        className={`relative rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 focus-within:ring-offset-white ${
          fill ? "flex-1 min-h-0" : ""
        }`}
      >
        {/* Styled outfit sits underneath and is revealed as the divider moves right. */}
        <Photo
          slot="tryon-after"
          fill={fill}
          fallback={afterFallback}
          rounded="rounded-none"
          alt=""
          className={fill ? "" : "w-full"}
        />

        {/* The plain outfit is clipped from the right edge inward. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          aria-hidden
        >
          <Photo
            slot="tryon-before"
            fill
            fallback={beforeFallback}
            rounded="rounded-none"
            alt=""
            
          />
        </div>

        {/* Divider. Purely visual — the input below owns the interaction. */}
        <div
          className="absolute inset-y-0 pointer-events-none w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(32,33,42,0.15)]"
          style={{ left: `${pos}%` }}
          aria-hidden
        >
          <span
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-lift grid place-items-center text-ink/70 ${
              compact ? "w-7 h-7" : "w-9 h-9"
            }`}
          >
            <svg viewBox="0 0 24 24" className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} fill="none">
              <path
                d="M9 6 4 12l5 6M15 6l5 6-5 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        <span
          className={`absolute top-2 left-2 rounded-full bg-white/92 text-ink font-semibold backdrop-blur-sm ${label}`}
        >
          Before
        </span>
        <span
          className={`absolute top-2 right-2 rounded-full bg-brand-500 text-white font-semibold ${label}`}
        >
          Try-on preview
        </span>

        <label htmlFor={id} className="sr-only">
          Reveal the try-on preview
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-valuetext={`${pos}% of the try-on preview shown`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize appearance-none bg-transparent"
          style={{ touchAction: "pan-y" }}
        />
      </div>

      {disclaimer && (
        <figcaption
          className={`text-ink/60 leading-snug shrink-0 ${fill ? "mt-1.5" : "mt-2"} ${
            compact || fill ? "text-[11px]" : "text-[12px]"
          }`}
        >
          {disclaimer}
        </figcaption>
      )}
    </figure>
  );
}
