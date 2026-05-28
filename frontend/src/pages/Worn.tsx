import { useEffect, useState } from "react";
import Nav from "../components/Nav";
import ClothCard from "../components/ClothCard";
import { api, type Cloth } from "../api";

export default function Worn() {
  const [worn, setWorn] = useState<Cloth[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await api.get<{ clothes: Cloth[] }>("/clothes?status=worn");
    setWorn(r.clothes);
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function reset() {
    if (!confirm(`Move all ${worn.length} worn items back to the wardrobe?`)) return;
    await api.post("/clothes/reset");
    setWorn([]);
  }

  async function clean(id: string) {
    await api.post(`/clothes/${id}/clean`);
    setWorn((p) => p.filter((c) => c.id !== id));
  }

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Worn pile</h1>
          {worn.length > 0 && (
            <button onClick={reset} className="text-sm bg-brand-600 text-white rounded-lg px-3 py-1.5 font-medium">
              Did laundry — reset all
            </button>
          )}
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : worn.length === 0 ? (
          <p className="text-gray-500 text-sm">Nothing here. Everything's clean.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {worn.map((c) => (
              <ClothCard key={c.id} cloth={c} onMarkClean={clean} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
