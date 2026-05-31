import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { api } from "../api";

type Code = { id: string; code: string; permission: "view" | "suggest" | "edit"; allowTryon: boolean };
type WithMe = { id: string; permission: string; allowTryon: boolean; viewerId: string; viewerName: string; viewerEmail: string };
type ICanSee = { id: string; permission: string; allowTryon: boolean; ownerId: string; ownerName: string; ownerEmail: string };

export default function Shared() {
  const nav = useNavigate();
  const [permission, setPermission] = useState<"view" | "suggest" | "edit">("suggest");
  const [allowTryon, setAllowTryon] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [withMe, setWithMe] = useState<WithMe[]>([]);
  const [iCanSee, setICanSee] = useState<ICanSee[]>([]);
  const [redeem, setRedeem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [a, b, c] = await Promise.all([
      api.get<{ codes: Code[] }>("/share/codes"),
      api.get<{ shares: WithMe[] }>("/share/with-me"),
      api.get<{ shares: ICanSee[] }>("/share/i-can-see"),
    ]);
    setCodes(a.codes);
    setWithMe(b.shares);
    setICanSee(c.shares);
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    setBusy(true);
    try {
      const r = await api.post<{ code: Code }>("/share/codes", { permission, allowTryon });
      setGenerated(r.code.code);
      setCodes((p) => [r.code, ...p]);
    } finally { setBusy(false); }
  }

  async function cancelCode(id: string) {
    await api.delete(`/share/codes/${id}`);
    setCodes((p) => p.filter((c) => c.id !== id));
  }

  async function doRedeem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ ownerId: string }>("/share/redeem", { code: redeem });
      setRedeem("");
      nav(`/friends/${r.ownerId}`);
    } catch (err: any) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function removeViewer(id: string) {
    if (!confirm("Remove this person's access?")) return;
    await api.delete(`/share/${id}/owner`);
    setWithMe((p) => p.filter((s) => s.id !== id));
  }

  async function disconnect(id: string) {
    if (!confirm("Disconnect from this wardrobe?")) return;
    await api.delete(`/share/${id}/viewer`);
    setICanSee((p) => p.filter((s) => s.id !== id));
  }

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        <section className="space-y-3">
          <h1 className="text-xl font-bold">Share your wardrobe</h1>
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-sm text-gray-600">
              Generate a code, then send it to your friend or family. They redeem it to access your wardrobe with the level you pick.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["view", "suggest", "edit"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPermission(p)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${permission === p ? "bg-brand-600 text-white border-brand-600" : "bg-white"}`}
                >
                  {p === "view" && "View only"}
                  {p === "suggest" && "View + suggest"}
                  {p === "edit" && "View + edit"}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {permission === "view" && "Friend can browse but cannot act."}
              {permission === "suggest" && "Friend can propose outfits; you approve."}
              {permission === "edit" && "Friend can mark your clothes as worn directly."}
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allowTryon}
                onChange={(e) => setAllowTryon(e.target.checked)}
                className="accent-brand-600 w-4 h-4"
              />
              <span>Also let them <strong>try on</strong> your clothes (uses their selfie)</span>
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                disabled={busy}
                onClick={generate}
                className="bg-brand-600 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60"
              >
                {busy ? "Generating…" : "Generate code"}
              </button>
              {generated && (
                <div className="flex items-center gap-2">
                  <code className="font-mono text-lg bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg">{generated}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(generated)}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          </div>
          {codes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Unused codes</h3>
              {codes.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>
                    <code className="font-mono bg-gray-100 px-2 py-0.5 rounded">{c.code}</code>
                    <span className="text-gray-500 ml-2 capitalize">({c.permission}{c.allowTryon ? " + try-on" : ""})</span>
                  </span>
                  <button
                    onClick={() => cancelCode(c.id)}
                    className="text-sm px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">People who can see your wardrobe</h2>
          {withMe.length === 0 ? (
            <p className="text-sm text-gray-500">Nobody yet. Share a code above to invite someone.</p>
          ) : (
            <ul className="bg-white rounded-2xl shadow-sm divide-y">
              {withMe.map((s) => (
                <li key={s.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.viewerName}</div>
                    <div className="text-xs text-gray-500">{s.viewerEmail} · {s.permission}{s.allowTryon ? " + try-on" : ""}</div>
                  </div>
                  <button
                    onClick={() => removeViewer(s.id)}
                    className="text-sm px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Connect to a friend's wardrobe</h2>
          <form onSubmit={doRedeem} className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3">
            <input
              value={redeem}
              onChange={(e) => setRedeem(e.target.value)}
              placeholder="Enter share code (e.g. A1B2C3D4)"
              className="border rounded-lg px-3 py-2 flex-1 min-w-[200px] font-mono uppercase"
            />
            <button disabled={busy || !redeem} className="bg-brand-600 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60">
              {busy ? "Connecting…" : "Connect"}
            </button>
            {error && <p className="text-sm text-red-600 w-full">{error}</p>}
          </form>
          {iCanSee.length > 0 && (
            <ul className="bg-white rounded-2xl shadow-sm divide-y">
              {iCanSee.map((s) => (
                <li key={s.id} className="p-4 flex items-center justify-between">
                  <div>
                    <Link to={`/friends/${s.ownerId}`} className="font-medium text-brand-700 hover:underline">
                      {s.ownerName}'s wardrobe
                    </Link>
                    <div className="text-xs text-gray-500">{s.ownerEmail} · {s.permission}{s.allowTryon ? " + try-on" : ""}</div>
                  </div>
                  <button
                    onClick={() => disconnect(s.id)}
                    className="text-sm px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    Disconnect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
