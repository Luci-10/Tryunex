import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import ClothCard from "../components/ClothCard";
import AddClothModal from "../components/AddClothModal";
import ClothDetailModal from "../components/ClothDetailModal";
import WardrobeFilters, { type SortMode } from "../components/WardrobeFilters";
import WardrobeHero from "../components/WardrobeHero";
import WardrobeSwitcher from "../components/WardrobeSwitcher";
import WardrobeTabs from "../components/WardrobeTabs";
import FAB from "../components/FAB";
import Button from "../components/ui/Button";
import Surface from "../components/ui/Surface";
import EmptyState from "../components/ui/EmptyState";
import { GridSkeleton } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import { Plus, Shirt, Refresh } from "../components/ui/icons";
import { useAuth } from "../auth";
import { api, type Cloth } from "../api";
import { OPEN_ADD_CLOTH_EVENT } from "../tour/OnboardingProvider";

const CATEGORY_ORDER = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

export default function Wardrobe() {
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [clean, setClean] = useState<Cloth[]>([]);
  const [wornCount, setWornCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortMode>("newest");

  const [addOpen, setAddOpen] = useState(false);

  function openDetail(id: string) {
    setDetailId(id);
  }
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const [a, b] = await Promise.all([
        api.get<{ clothes: Cloth[] }>("/clothes?status=clean"),
        api.get<{ clothes: Cloth[] }>("/clothes?status=worn"),
      ]);
      setClean(a.clothes);
      setWornCount(b.clothes.length);
    } catch (err: any) {
      setLoadError(err.message ?? "Could not load your wardrobe");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  // The onboarding slideshow's "Add my first piece" opens the existing sheet
  // through the normal path — no photo picker or permission is triggered.
  useEffect(() => {
    const onOpen = () => setAddOpen(true);
    window.addEventListener(OPEN_ADD_CLOTH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ADD_CLOTH_EVENT, onOpen);
  }, []);

  const isSunday = new Date().getDay() === 0;

  async function resetWorn() {
    const ok = await confirm({
      title: "Move everything back?",
      body: `All ${wornCount} worn piece${wornCount === 1 ? "" : "s"} return to your clean wardrobe.`,
      confirmLabel: "Yes, reset",
    });
    if (!ok) return;
    await api.post("/clothes/reset");
    await load();
    toast("Wardrobe refreshed", { tone: "success" });
  }

  async function wearToday(id: string) {
    const item = clean.find((c) => c.id === id);
    // Optimistic: the card leaves the grid immediately, undo puts it back.
    setClean((p) => p.filter((c) => c.id !== id));
    setWornCount((n) => n + 1);
    try {
      await api.post("/clothes/wear", { ids: [id] });
      toast(item ? `${item.name} moved to Worn` : "Moved to Worn", {
        tone: "success",
        action: {
          label: "Undo",
          onClick: async () => {
            await api.post(`/clothes/${id}/clean`);
            await load();
          },
        },
      });
    } catch (err: any) {
      await load();
      toast(err.message ?? "Could not mark as worn", { tone: "error" });
    }
  }

  function onAdded(c: Cloth) {
    setClean((p) => [c, ...p]);
    toast(`${c.name} added`, { tone: "success" });
  }

  function onSaved(c: Cloth) {
    setClean((p) => p.map((x) => (x.id === c.id ? c : x)));
    toast("Changes saved", { tone: "success" });
  }

  function onDeleted(id: string) {
    setClean((p) => p.filter((c) => c.id !== id));
    toast("Piece deleted", { tone: "success" });
  }

  // --- derived ---
  const totalOwned = clean.length + wornCount;

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clean) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return m;
  }, [clean]);

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
    // newest = the API's own order (desc by createdAt)
    return arr;
  }, [clean, search, activeCat, sort]);

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
    <PageShell>
      <WardrobeSwitcher current="mine" />

      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <WardrobeHero
            name={user?.name ?? "there"}
            total={totalOwned}
            clean={clean.length}
            worn={wornCount}
          />
        </div>
        {/* Desktop gets a labelled header action; phones get the FAB. */}
        <Button
                   className="hidden md:inline-flex mt-1"
          size="lg"
          leading={<Plus className="w-4 h-4" />}
          onClick={() => setAddOpen(true)}
        >
          Add piece
        </Button>
      </div>

      {/* Laundry has no permanent nav slot, so it lives here. */}
      <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
        <WardrobeTabs cleanCount={clean.length} wornCount={wornCount} />
      </div>

      {isSunday && wornCount > 0 && (
        <Surface tone="butter" className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            🧺
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">It's Sunday — laundry done?</p>
            <p className="text-[13px] text-ink/70">
              Send {wornCount} worn piece{wornCount === 1 ? "" : "s"} back to the wardrobe.
            </p>
          </div>
          <Button size="sm" onClick={resetWorn} leading={<Refresh className="w-4 h-4" />}>
            Reset
          </Button>
        </Surface>
      )}

      {loadError && <ErrorBanner onRetry={() => load()}>{loadError}</ErrorBanner>}

      <WardrobeFilters
        search={search}
        onSearch={setSearch}
        activeCategory={activeCat}
        onCategory={setActiveCat}
        sort={sort}
        onSort={setSort}
        counts={categoryCounts}
      />

      {loading ? (
        <GridSkeleton count={8} />
      ) : clean.length === 0 ? (
        <EmptyState
          icon={<Shirt className="w-7 h-7" />}
          title="Your wardrobe is empty"
          body="Add your first piece — snap a photo or pick one from your gallery."
          action={{ label: "Add a piece", onClick: () => setAddOpen(true) }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          tone="butter"
          title="Nothing matches"
          body="Try a different word, or clear the filters to see everything again."
          action={{
            label: "Clear filters",
            onClick: () => {
              setSearch("");
              setActiveCat("all");
            },
          }}
        />
      ) : grouped ? (
        <div className="space-y-6">
          {grouped.map(([cat, items]) => (
            <section key={cat} className="space-y-2.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink/65 capitalize">
                {cat}
                <span className="ml-1.5 text-ink/55 normal-case">· {items.length}</span>
              </h2>
              <Grid items={items} onOpen={openDetail} onWearToday={wearToday} />
            </section>
          ))}
        </div>
      ) : (
        <Grid items={filtered} onOpen={openDetail} onWearToday={wearToday} />
      )}

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
    </PageShell>
  );
}

function Grid({
  items,
  onOpen,
  onWearToday,
}: {
  items: Cloth[];
  onOpen: (id: string) => void;
  onWearToday: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {items.map((c) => (
        // The first card is the tour's "open your piece" target.
        <ClothCard key={c.id} cloth={c} onClick={() => onOpen(c.id)} onWearToday={onWearToday} />
      ))}
    </div>
  );
}
