import type { StyleTag } from "./api";

/**
 * Presentation for the primary style/formality tag. The values mirror the
 * backend enum exactly; the labels and tones live only here.
 */
export const STYLE_TAGS: { value: StyleTag; label: string; tone: string }[] = [
  { value: "casual", label: "Casual", tone: "bg-lilac text-brand-700" },
  { value: "smart_casual", label: "Smart casual", tone: "bg-sky text-blue-800" },
  { value: "formal", label: "Formal", tone: "bg-ink/[0.07] text-ink/75" },
  { value: "party", label: "Party", tone: "bg-peach text-orange-800" },
  { value: "sports", label: "Sports", tone: "bg-mint text-emerald-800" },
  { value: "lounge", label: "Lounge", tone: "bg-butter text-amber-800" },
  { value: "traditional", label: "Traditional", tone: "bg-coral/15 text-coral" },
  { value: "other", label: "Other", tone: "bg-ink/[0.06] text-ink/65" },
];

const BY_VALUE = new Map(STYLE_TAGS.map((t) => [t.value, t]));

/** Existing garments predate tags — they read as "casual" per the column default. */
export function styleTagOf(tag: StyleTag | undefined | null) {
  return BY_VALUE.get(tag ?? "casual") ?? BY_VALUE.get("other")!;
}
