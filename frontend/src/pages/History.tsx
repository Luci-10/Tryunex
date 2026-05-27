import { useEffect, useState } from "react";
import Nav from "../components/Nav";
import { api } from "../api";

type Row = {
  id: number;
  wornOn: string;
  clothName: string;
  clothImage: string;
  category: string;
};

export default function History() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ history: Row[] }>("/history")
      .then((r) => setRows(r.history))
      .finally(() => setLoading(false));
  }, []);

  const byDate = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byDate.has(r.wornOn)) byDate.set(r.wornOn, []);
    byDate.get(r.wornOn)!.push(r);
  }

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold">Wear history</h1>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : byDate.size === 0 ? (
          <p className="text-gray-500 text-sm">Nothing worn yet.</p>
        ) : (
          [...byDate.entries()].map(([date, items]) => (
            <section key={date} className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700">
                {new Date(date).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {items.map((i) => (
                  <div key={i.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="aspect-square bg-gray-100">
                      <img src={i.clothImage} alt={i.clothName} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-1.5">
                      <div className="text-xs font-medium truncate">{i.clothName}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </>
  );
}
