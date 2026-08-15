import { useMemo, useState } from "react";
import type { Cloth } from "../../api";
import { useTryOn, slotOf, SLOT_LABEL, type Slot } from "../../tryon";
import { FilterChip, Badge } from "../ui/Chip";
import EmptyState from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { styleTagOf } from "../../styleTags";
import { Check, Close, Search, Shirt } from "../ui/icons";

/** A garment offered in the picker, tagged with whose wardrobe it came from. */
export type PickerItem = Cloth & { ownerName?: string };

const SLOT_FILTERS: { value: Slot | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "top", label: "Tops" },
  { value: "bottom", label: "Bottoms" },
  { value: "dress", label: "Dresses" },
  { value: "outerwear", label: "Outerwear" },
  { value: "shoes", label: "Shoes" },
  { value: "accessory", label: "Accessories" },
  { value: "other", label: "Other" },
];

export default function WardrobePicker({
  items,
  loading,
  onPick,
}: {
  items: PickerItem[];
  loading: boolean;
  /** Returns the rule outcome so the page can raise a confirmation. */
  onPick: (cloth: PickerItem) => void;
}) {
  const { selection, evaluate, locked } = useTryOn();
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState<Slot | "all">("all");
  const [tag, setTag] = useState<string | "all">("all");

  const availableSlots = useMemo(() => {
    const present = new Set(items.map(slotOf));
    return SLOT_FILTERS.filter((f) => f.value === "all" || present.has(f.value as Slot));
  }, [items]);

  const availableTags = useMemo(() => {
    const present = new Set(items.map((i) => i.styleTag ?? "casual"));
    return [...present];
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (slot !== "all" && slotOf(c) !== slot) return false;
      if (tag !== "all" && (c.styleTag ?? "casual") !== tag) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, slot, tag]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Shirt className="w-7 h-7" />}
        title="No clothes to try on"
        body="Add pieces to your wardrobe, then come back and build a look."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search garments"
          aria-label="Search garments"
          className="w-full h-11 bg-white border border-ink/12 rounded-full pl-10 pr-10 text-[15px] placeholder:text-ink/40 focus:border-brand-400"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="tap-44 absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/45 hover:text-ink"
          >
            <Close className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {availableSlots.map((f) => (
          <FilterChip key={f.value} active={slot === f.value} onClick={() => setSlot(f.value)}>
            {f.label}
          </FilterChip>
        ))}
      </div>

      {availableTags.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          <FilterChip active={tag === "all"} onClick={() => setTag("all")}>
            Any style
          </FilterChip>
          {availableTags.map((t) => (
            <FilterChip key={t} active={tag === t} onClick={() => setTag(t)}>
              {styleTagOf(t as any).label}
            </FilterChip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          tone="butter"
          title="Nothing matches"
          body="Try a different search or category."
          action={{
            label: "Clear filters",
            onClick: () => {
              setQuery("");
              setSlot("all");
              setTag("all");
            },
          }}
        />
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visible.map((c) => {
            const picked = selection.some((s) => s.id === c.id);
            const outcome = picked ? null : evaluate(c);
            const blocked = outcome?.status === "blocked";
            const replaces =
              outcome?.status === "needs-confirm" && outcome.kind === "replace"
                ? outcome.removes[0]
                : null;

            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  disabled={blocked || locked}
                  aria-pressed={picked}
                  aria-label={
                    picked
                      ? `Remove ${c.name} from your look`
                      : blocked
                        ? `${c.name} — ${outcome?.status === "blocked" ? outcome.message : "unavailable"}`
                        : `Add ${c.name} to your look`
                  }
                  className={`relative w-full rounded-xl overflow-hidden bg-white border text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                    picked ? "border-brand-500 ring-2 ring-brand-500/40" : "border-ink/[0.07]"
                  }`}
                >
                  <span className="relative block">
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      loading="lazy"
                      className="w-full aspect-square object-cover bg-ink/[0.04]"
                    />
                    {picked && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-500 text-white grid place-items-center">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {c.status === "worn" && (
                      <span className="absolute top-1.5 left-1.5">
                        <Badge tone="peach">Worn</Badge>
                      </span>
                    )}
                  </span>
                  <span className="block px-2 py-1.5">
                    <span className="block text-[11px] font-medium truncate">{c.name}</span>
                    <span className="block text-[10px] text-ink/55 truncate">
                      {c.ownerName ? `${c.ownerName}'s` : SLOT_LABEL[slotOf(c)]}
                    </span>
                    {replaces && (
                      <span className="block text-[9.5px] text-orange-700 truncate mt-0.5">
                        Replaces {replaces.name}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
