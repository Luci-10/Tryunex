import { useEffect, useRef, useState } from "react";
import { FilterChip } from "./ui/Chip";
import IconButton from "./ui/IconButton";
import { Search, Sort, Close, Check } from "./ui/icons";

export type SortMode = "newest" | "name" | "category";

const ORDER = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

const SORT_LABEL: Record<SortMode, string> = {
  newest: "Newest first",
  name: "Name (A–Z)",
  category: "By category",
};

export default function WardrobeFilters({
  search,
  onSearch,
  activeCategory,
  onCategory,
  sort,
  onSort,
  counts,
}: {
  search: string;
  onSearch: (s: string) => void;
  activeCategory: string | "all";
  onCategory: (c: string | "all") => void;
  sort: SortMode;
  onSort: (m: SortMode) => void;
  counts: Map<string, number>;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const chips = ORDER.filter((c) => counts.has(c));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (!sortOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setSortOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSortOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortOpen]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/55 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search your wardrobe"
            aria-label="Search your wardrobe"
            className="w-full h-11 bg-white border border-ink/12 rounded-full pl-10 pr-10 text-[16px] placeholder:text-ink/55 focus:border-brand-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              aria-label="Clear search"
              className="tap-44 absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/60 hover:text-ink"
            >
              <Close className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sort stays a small icon menu so it never competes with the chips. */}
        <div className="relative shrink-0" ref={menuRef}>
          <IconButton
            label={`Sort: ${SORT_LABEL[sort]}`}
            onClick={() => setSortOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            className="!w-11 !h-11"
          >
            <Sort className="w-5 h-5" />
          </IconButton>
          {sortOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 z-20 w-48 bg-white rounded-xl border border-ink/10 shadow-lift p-1 animate-fade-in"
            >
              {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
                <button
                  key={m}
                  role="menuitemradio"
                  aria-checked={sort === m}
                  onClick={() => {
                    onSort(m);
                    setSortOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 h-10 px-3 rounded-lg text-sm text-left ${
                    sort === m ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-ink/[0.04]"
                  }`}
                >
                  <Check className={`w-4 h-4 ${sort === m ? "opacity-100" : "opacity-0"}`} />
                  {SORT_LABEL[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
        <FilterChip active={activeCategory === "all"} onClick={() => onCategory("all")} count={total}>
          All
        </FilterChip>
        {chips.map((c) => (
          <FilterChip
            key={c}
            active={activeCategory === c}
            onClick={() => onCategory(c)}
            count={counts.get(c)}
          >
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
