import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import ClothCard from "../components/ClothCard";
import { api, type Cloth } from "../api";

export default function Plan() {
  const nav = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [clean, setClean] = useState<Cloth[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ clothes: Cloth[] }>("/clothes?status=clean")
      .then((r) => setClean(r.clothes))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: number) {
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function wear() {
    if (sel.size === 0) return;
    setBusy(true);
    try {
      await api.post("/clothes/wear", { ids: [...sel], date });
      nav("/worn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">Plan an outfit</h1>
          <p className="text-sm text-gray-600">Pick the pieces you'll wear and the date. They'll move to your Worn pile.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3 sticky top-24 z-[1]">
          <label className="text-sm font-medium">Date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-lg px-3 py-2"
          />
          <span className="ml-auto text-sm text-gray-600">{sel.size} selected</span>
          <button
            disabled={busy || sel.size === 0}
            onClick={wear}
            className="bg-brand-600 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60"
          >
            {busy ? "Saving…" : "Wear these"}
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
      </main>
    </>
  );
}
