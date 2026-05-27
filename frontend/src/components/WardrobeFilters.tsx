import type { Cloth } from "../api";

export type SortMode = "newest" | "name" | "category";

const ORDER: Cloth["category"][] = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

export default function WardrobeFilters({
  search,
  onSearch,
  activeCategory,
  onCategory,
  sort,
  onSort,
  available,
}: {
  search: string;
  onSearch: (s: string) => void;
  activeCategory: string | "all";
  onCategory: (c: string | "all") => void;
  sort: SortMode;
  onSort: (m: SortMode) => void;
  available: Set<string>;
}) {
  const chips = ["all", ...ORDER.filter((c) => available.has(c))];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search your wardrobe…"
          className="flex-1 border rounded-lg px-3 py-2 bg-white"
        />
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortMode)}
          className="border rounded-lg px-2 py-2 bg-white text-sm"
        >
          <option value="newest">Newest</option>
          <option value="name">Name</option>
          <option value="category">Category</option>
        </select>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => onCategory(c)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border ${activeCategory === c ? "bg-brand-600 text-white border-brand-600" : "bg-white border-gray-200 hover:bg-brand-50"}`}
          >
            {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
