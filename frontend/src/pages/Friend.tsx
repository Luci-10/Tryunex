import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Nav from "../components/Nav";
import ClothCard from "../components/ClothCard";
import WardrobeSwitcher from "../components/WardrobeSwitcher";
import { api, type Cloth } from "../api";

type Permission = "view" | "suggest" | "edit";

export default function Friend() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<{
    permission: Permission;
    owner: { id: string; name: string };
    clothes: Cloth[];
  } | null>(null);
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
      const r = await api.get<typeof data>(`/friends/${ownerId}/wardrobe`);
      setData(r);
    } catch (err: any) {
      setAccessError(err.message ?? "Could not load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [ownerId]);

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
        await api.post(`/friends/${ownerId}/wear`, { ids: [...sel], date });
        setMsg("Marked as worn ✓");
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
    } finally { setBusy(false); }
  }

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

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <WardrobeSwitcher current={ownerId ?? "mine"} />
        <div>
          <h1 className="text-xl font-bold">{data.owner.name}'s wardrobe</h1>
          <p className="text-sm text-gray-500">Your access: {data.permission}</p>
        </div>

        {canAct && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 sticky top-24 z-[1]">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium">For:</label>
              <input
                type="date"
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
              {busy ? "Sending…" : data.permission === "edit" ? "Mark these as worn" : "Send suggestion"}
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
