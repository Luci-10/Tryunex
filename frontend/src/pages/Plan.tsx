import { useEffect, useMemo, useState } from "react";
import Nav from "../components/Nav";
import ClothCard from "../components/ClothCard";
import WardrobeSwitcher from "../components/WardrobeSwitcher";
import { api, type Cloth } from "../api";

type PlanEntry = {
  id: string;
  wornOn: string;
  cloth: { id: string; name: string; category: string; imageUrl: string; status: "clean" | "worn" };
};

function formatDate(d: string, today: string) {
  if (d === today) return "Today";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function Plan() {
  const today = new Date().toISOString().slice(0, 10);
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [clean, setClean] = useState<Cloth[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [p, c] = await Promise.all([
      api.get<{ plans: PlanEntry[] }>("/clothes/plans"),
      api.get<{ clothes: Cloth[] }>("/clothes?status=clean"),
    ]);
    setPlans(p.plans);
    setClean(c.clothes);
  }
  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function planOutfit() {
    if (sel.size === 0) return;
    setBusy(true);
    try {
      await api.post("/clothes/plan", { ids: [...sel], date });
      setSel(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan(id: string) {
    if (!confirm("Cancel this plan?")) return;
    await api.delete(`/clothes/plans/${id}`);
    setPlans((p) => p.filter((x) => x.id !== id));
  }

  const grouped = useMemo(() => {
    const m = new Map<string, PlanEntry[]>();
    for (const p of plans) {
      if (!m.has(p.wornOn)) m.set(p.wornOn, []);
      m.get(p.wornOn)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [plans]);

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <WardrobeSwitcher current="mine" />
        <div>
          <h1 className="text-xl font-bold">Plan outfits</h1>
          <p className="text-sm text-gray-600">
            Pick what you'll wear and when. Plans show here until the day passes, then move to your Worn pile.
          </p>
        </div>

        {grouped.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Upcoming plans</h2>
            {grouped.map(([d, items]) => (
              <div key={d} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-800">
                  {formatDate(d, today)}
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    {items.length} piece{items.length === 1 ? "" : "s"}
                  </span>
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {items.map((p) => (
                    <div key={p.id} className="bg-gray-50 rounded-lg overflow-hidden relative">
                      <div className="aspect-square">
                        <img src={p.cloth.imageUrl} alt={p.cloth.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-1.5 text-xs truncate">{p.cloth.name}</div>
                      <button
                        onClick={() => cancelPlan(p.id)}
                        className="absolute top-1 right-1 bg-white/90 hover:bg-white text-gray-700 hover:text-red-700 rounded-full w-6 h-6 text-sm leading-none shadow"
                        aria-label="Cancel plan"
                        title="Cancel plan"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Plan a new outfit</h2>

          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3 sticky top-24 z-[1]">
            <label className="text-sm font-medium">Date:</label>
            <input
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-lg px-3 py-2"
            />
            <span className="ml-auto text-sm text-gray-600">{sel.size} selected</span>
            <button
              disabled={busy || sel.size === 0}
              onClick={planOutfit}
              className="bg-brand-600 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60"
            >
              {busy ? "Saving…" : "Plan these"}
            </button>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : clean.length === 0 ? (
            <p className="text-gray-500 text-sm">Your wardrobe is empty (or everything is worn).</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {clean.map((c) => (
                <ClothCard key={c.id} cloth={c} selected={sel.has(c.id)} onClick={() => toggle(c.id)} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
