import { useEffect, useMemo, useState } from "react";
import Nav from "../components/Nav";
import ClothCard from "../components/ClothCard";
import AddClothModal from "../components/AddClothModal";
import ClothDetailModal from "../components/ClothDetailModal";
import WardrobeFilters, { type SortMode } from "../components/WardrobeFilters";
import StatsRow from "../components/StatsRow";
import FAB from "../components/FAB";
import { api, type Cloth } from "../api";

const CATEGORY_ORDER = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

export default function Wardrobe() {
  const [clean, setClean] = useState<Cloth[]>([]);
  const [wornCount, setWornCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortMode>("newest");

  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  function flash(msg: string) {
    setToast(msg);
    window.clearTimeout((flash as any)._t);
    (flash as any)._t = window.setTimeout(() => setToast(null), 1800);
  }

  async function load() {
    const [a, b] = await Promise.all([
      api.get<{ clothes: Cloth[] }>("/clothes?status=clean"),
      api.get<{ clothes: Cloth[] }>("/clothes?status=worn"),
    ]);
    setClean(a.clothes);
    setWornCount(b.clothes.length);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const isSunday = new Date().getDay() === 0;

  async function resetWorn() {
    if (!confirm("Move all worn clothes back to the wardrobe?")) return;
    await api.post("/clothes/reset");
    await load();
    flash("Reset done — wardrobe refreshed");
  }

  async function wearToday(id: number) {
    const date = new Date().toISOString().slice(0, 10);
    await api.post("/clothes/wear", { ids: [id], date });
    setClean((p) => p.filter((c) => c.id !== id));
    setWornCount((n) => n + 1);
    flash("Moved to Worn pile");
  }

  function onAdded(c: Cloth) {
    setClean((p) => [c, ...p]);
    flash("Added to wardrobe");
  }

  function onSaved(c: Cloth) {
    setClean((p) => p.map((x) => (x.id === c.id ? c : x)));
  }

  function onDeleted(id: number) {
    setClean((p) => p.filter((c) => c.id !== id));
    flash("Deleted");
  }

  // --- derived ---
  const totalOwned = clean.length + wornCount;

  // category counts for filter chips and stats
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clean) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return m;
  }, [clean]);

  const topCategory = useMemo(() => {
    let best: { name: string; count: number } | null = null;
    for (const [name, count] of categoryCounts) {
      if (!best || count > best.count) best = { name, count };
    }
    return best;
  }, [categoryCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = clean.filter((c) => {
      if (activeCat !== "all" && c.category !== activeCat) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.category.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === "name") arr = [...arr].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "category") {
      arr = [...arr].sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a.category);
        const ib = CATEGORY_ORDER.indexOf(b.category);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.name.localeCompare(b.name);
      });
    }
    // newest = preserve API order (already desc by createdAt)
    return arr;
  }, [clean, search, activeCat, sort]);

  // Group only when sort === "category"
  const grouped = useMemo(() => {
    if (sort !== "category") return null;
    const g = new Map<string, Cloth[]>();
    for (const c of filtered) {
      if (!g.has(c.category)) g.set(c.category, []);
      g.get(c.category)!.push(c);
    }
    return [...g.entries()].sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [filtered, sort]);

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5 pb-24">
        {isSunday && wornCount > 0 && (
          <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-brand-700">It's Sunday — did you do laundry?</p>
              <p className="text-sm text-gray-600">
                Move {wornCount} worn item{wornCount === 1 ? "" : "s"} back to your wardrobe.
              </p>
            </div>
            <button
              onClick={resetWorn}
              className="bg-brand-600 text-white rounded-lg px-4 py-2 font-medium whitespace-nowrap"
            >
              Yes, reset
            </button>
          </div>
        )}

        <StatsRow total={totalOwned} clean={clean.length} worn={wornCount} topCategory={topCategory} />

        <WardrobeFilters
          search={search}
          onSearch={setSearch}
          activeCategory={activeCat}
          onCategory={setActiveCat}
          sort={sort}
          onSort={setSort}
          available={new Set(categoryCounts.keys())}
        />

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : clean.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No pieces match your search. <button onClick={() => { setSearch(""); setActiveCat("all"); }} className="text-brand-700 hover:underline">Clear filters</button>
          </p>
        ) : grouped ? (
          <div className="space-y-5">
            {grouped.map(([cat, items]) => (
              <section key={cat} className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 capitalize sticky top-[112px] bg-[#faf7ff]/95 backdrop-blur py-1 z-[1]">
                  {cat} <span className="text-gray-400 font-normal">· {items.length}</span>
                </h3>
                <Grid items={items} onOpen={setDetailId} onWearToday={wearToday} />
              </section>
            ))}
          </div>
        ) : (
          <Grid items={filtered} onOpen={setDetailId} onWearToday={wearToday} />
        )}
      </main>

      <FAB onClick={() => setAddOpen(true)} />

      <AddClothModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={onAdded} />
      <ClothDetailModal
        clothId={detailId}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        onSaved={onSaved}
        onDeleted={onDeleted}
        onWearToday={wearToday}
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-30">
          {toast}
        </div>
      )}
    </>
  );
}

function Grid({
  items,
  onOpen,
  onWearToday,
}: {
  items: Cloth[];
  onOpen: (id: number) => void;
  onWearToday: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {items.map((c) => (
        <ClothCard
          key={c.id}
          cloth={c}
          onClick={() => onOpen(c.id)}
          onWearToday={onWearToday}
        />
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-3">
      <div className="text-5xl">👕</div>
      <h3 className="font-semibold">Your wardrobe is empty</h3>
      <p className="text-sm text-gray-600">Add your first piece — take a photo or upload one from your phone.</p>
      <button onClick={onAdd} className="bg-brand-600 text-white rounded-lg px-4 py-2 font-medium">
        Add a piece
      </button>
    </div>
  );
}
