import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Nav from "../components/Nav";
import ClothCard from "../components/ClothCard";
import WardrobeSwitcher from "../components/WardrobeSwitcher";
import { api, type Cloth } from "../api";

type Permission = "view" | "suggest" | "edit";

type PlanEntry = {
  id: string;
  wornOn: string;
  cloth: { id: string; name: string; category: string; imageUrl: string; status: "clean" | "worn" };
};

type FriendData = {
  permission: Permission;
  owner: { id: string; name: string };
  clothes: Cloth[];
  plans: PlanEntry[];
};

function formatDate(d: string, today: string) {
  if (d === today) return "Today";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function Friend() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<FriendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<FriendData>(`/friends/${ownerId}/wardrobe`);
      setData(r);
    } catch (err: any) {
      setAccessError(err.message ?? "Could not load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [ownerId]);

  function toggle(id: string) {
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function submit() {
    if (!data || sel.size === 0) return;
    setBusy(true);
    try {
      if (data.permission === "edit") {
        await api.post(`/friends/${ownerId}/plan`, { ids: [...sel], date });
        setMsg("Outfit planned ✓");
        await load();
      } else {
        await api.post(`/friends/${ownerId}/suggest`, {
          clothIds: [...sel],
          note: note || null,
          forDate: date,
        });
        setMsg("Suggestion sent ✓");
        setNote("");
      }
      setSel(new Set());
      setTimeout(() => setMsg(null), 2500);
    } finally {
      setBusy(false);
    }
  }

  const groupedPlans = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, PlanEntry[]>();
    for (const p of data.plans) {
      if (!m.has(p.wornOn)) m.set(p.wornOn, []);
      m.get(p.wornOn)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  if (loading) {
    return (
      <>
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <WardrobeSwitcher current={ownerId ?? "mine"} />
          <p className="text-gray-500">Loading…</p>
        </main>
      </>
    );
  }
  if (accessError || !data) {
    return (
      <>
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <WardrobeSwitcher current={ownerId ?? "mine"} />
          <p className="text-gray-600">{accessError ?? "No access"}</p>
        </main>
      </>
    );
  }

  const canAct = data.permission !== "view";
  const actionLabel = data.permission === "edit" ? "Plan this" : "Send suggestion";

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <WardrobeSwitcher current={ownerId ?? "mine"} />
        <div>
          <h1 className="text-xl font-bold">{data.owner.name}'s wardrobe</h1>
          <p className="text-sm text-gray-500">Your access: {data.permission}</p>
        </div>

        {groupedPlans.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Upcoming plans</h2>
            {groupedPlans.map(([d, items]) => (
              <div key={d} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-800">
                  {formatDate(d, today)}
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    {items.length} piece{items.length === 1 ? "" : "s"}
                  </span>
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {items.map((p) => (
                    <div key={p.id} className="bg-gray-50 rounded-lg overflow-hidden">
                      <div className="aspect-square">
                        <img src={p.cloth.imageUrl} alt={p.cloth.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-1.5 text-xs truncate">{p.cloth.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {canAct && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 sticky top-24 z-[1]">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium">For:</label>
              <input
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
              <span className="text-sm text-gray-600">{sel.size} selected</span>
            </div>
            {data.permission === "suggest" && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note (optional)"
                className="w-full border rounded-lg px-3 py-2"
              />
            )}
            <button
              disabled={busy || sel.size === 0}
              onClick={submit}
              className="bg-brand-600 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60"
            >
              {busy ? "Saving…" : actionLabel}
            </button>
            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          </div>
        )}

        {data.clothes.length === 0 ? (
          <p className="text-gray-500 text-sm">Nothing clean in their wardrobe.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.clothes.map((c) => (
              <ClothCard
                key={c.id}
                cloth={c}
                selected={sel.has(c.id)}
                onClick={canAct ? () => toggle(c.id) : undefined}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
