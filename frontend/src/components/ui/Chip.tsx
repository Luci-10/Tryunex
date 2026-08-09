import type { ReactNode } from "react";

/** Segmented filter chip. Selection is carried by fill + weight, not colour alone. */
export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "h-9 px-3.5 rounded-full text-sm whitespace-nowrap border transition-colors shrink-0",
        active
          ? "bg-brand-500 text-white border-brand-500 font-medium"
          : "bg-white text-ink/70 border-ink/10 hover:bg-brand-50 hover:text-brand-700",
      ].join(" ")}
    >
      {children}
      {count !== undefined && (
        <span className={active ? "ml-1.5 text-white/70" : "ml-1.5 text-ink/55"}>{count}</span>
      )}
    </button>
  );
}

const BADGE_TONES = {
  mint: "bg-mint text-emerald-800",
  peach: "bg-peach text-orange-800",
  sky: "bg-sky text-blue-800",
  lilac: "bg-lilac text-brand-700",
  butter: "bg-butter text-amber-800",
  coral: "bg-coral/15 text-coral",
  ink: "bg-ink/[0.06] text-ink/65",
};

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "ink",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium leading-5 ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
