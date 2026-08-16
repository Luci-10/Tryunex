import { useEffect, useRef, useState, type ReactNode } from "react";
import { SLOTS, srcFor, srcSetFor, type SlotName } from "../../marketing/assets";

type Overlay = "none" | "bottom" | "full";

const OVERLAY: Record<Overlay, string> = {
  none: "",
  // Enough contrast for white text sitting in the lower third.
  bottom: "bg-gradient-to-t from-ink/75 via-ink/25 to-transparent",
  // For text that spans the frame.
  full: "bg-gradient-to-br from-ink/60 via-ink/35 to-ink/50",
};

/**
 * A marketing photograph in a fixed-ratio frame.
 *
 * Three things it guarantees, because all three were requirements rather than
 * nice-to-haves:
 *
 *  - No layout shift. The frame reserves its ratio before the file loads.
 *  - No broken frames. If the asset is missing or fails to decode, the
 *    `fallback` illustration renders instead. That is what keeps the pages
 *    whole while the photography is still being commissioned.
 *  - No eager loading below the fold. Only `priority` slots load eagerly.
 */
export default function Photo({
  slot,
  fallback,
  priority = false,
  overlay = "none",
  className = "",
  rounded = "rounded-2xl",
  alt,
  fill = false,
  children,
}: {
  slot: SlotName;
  /** Shown when the file is absent. Also shown to nothing else — not a spinner. */
  fallback?: ReactNode;
  priority?: boolean;
  overlay?: Overlay;
  className?: string;
  rounded?: string;
  /** Overrides the manifest alt. Pass "" only if adjacent copy says the same. */
  alt?: string;
  /**
   * Fill the parent instead of reserving the manifest ratio. Only safe where
   * the parent already has a definite size, otherwise the frame collapses and
   * the layout-shift guarantee is lost.
   */
  fill?: boolean;
  /** Content layered over the photo, e.g. a caption or label. */
  children?: ReactNode;
}) {
  const meta = SLOTS[slot];
  const [state, setState] = useState<"pending" | "loaded" | "failed">("pending");
  const imgRef = useRef<HTMLImageElement>(null);

  // A cached image can already be complete before React attaches onLoad, in
  // which case neither handler ever fires and we would sit on the skeleton.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    setState(img.naturalWidth > 0 ? "loaded" : "failed");
  }, [slot]);

  // The frame is always `relative` — it is the containing block for the image
  // inside it. Callers must not pass a position class: Tailwind emits
  // `.relative` after `.absolute`, so an `absolute` in `className` loses to
  // this one no matter what order the attribute is written in. To overlay a
  // photo, wrap it in your own absolutely-positioned element.
  const frame = `relative overflow-hidden ${rounded} ${fill ? "w-full h-full" : ""} ${className}`;
  const ratio = fill ? undefined : { aspectRatio: String(meta.aspect) };

  if (state === "failed" && fallback) {
    return (
      <div className={frame} style={ratio}>
        <div className="absolute inset-0">{fallback}</div>
        {children}
      </div>
    );
  }

  return (
    <div className={`${frame} bg-ink/[0.05]`} style={ratio}>
      {state === "pending" && (
        <div className="absolute inset-0 shimmer bg-ink/[0.06]" aria-hidden />
      )}

      <img
        ref={imgRef}
        src={srcFor(meta)}
        srcSet={srcSetFor(meta)}
        sizes={meta.sizes}
        alt={alt ?? meta.alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          state === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        style={{ objectPosition: meta.position }}
      />

      {overlay !== "none" && (
        <div className={`absolute inset-0 pointer-events-none ${OVERLAY[overlay]}`} aria-hidden />
      )}

      {children}
    </div>
  );
}
