import type { ElementType, ReactNode } from "react";

/**
 * The one card surface. `tone` tints it for meaning (mint = clean/success,
 * peach = planning, sky = sharing, butter = highlight, lilac = brand).
 */
const TONES = {
  white: "bg-white border-ink/[0.06]",
  lilac: "bg-lilac border-brand-200/70",
  mint: "bg-mint border-emerald-600/10",
  peach: "bg-peach border-orange-600/10",
  sky: "bg-sky border-blue-600/10",
  butter: "bg-butter border-amber-600/10",
  coral: "bg-coral/10 border-coral/20",
};

export type SurfaceTone = keyof typeof TONES;

export default function Surface({
  as: Tag = "div",
  tone = "white",
  padded = true,
  className = "",
  children,
}: {
  as?: ElementType;
  tone?: SurfaceTone;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={[
        "rounded-card border shadow-card",
        TONES[tone],
        padded ? "p-4" : "",
        className,
      ].join(" ")}
    >
      {children}
    </Tag>
  );
}
