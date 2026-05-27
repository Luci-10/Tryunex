import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { api } from "../api";
import { useAuth } from "../auth";

type Sug = {
  id: number;
  note: string | null;
  forDate: string | null;
  suggesterName: string;
  clothes: { id: number; name: string; imageUrl: string }[];
};

export default function Account() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    const r = await api.get<{ suggestions: Sug[] }>("/suggestions");
    setSugs(r.suggestions);
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function respond(id: number, accept: boolean) {
    setBusy(id);
    try {
      await api.post(`/suggestions/${id}/respond`, { accept });
      setSugs((p) => p.filter((s) => s.id !== id));
    } finally { setBusy(null); }
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
    nav("/login", { replace: true });
  }

  if (!user) return null;

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
          <h1 className="text-xl font-bold">Account</h1>
          <p className="text-sm"><span className="text-gray-500">Name: </span>{user.name}</p>
          <p className="text-sm"><span className="text-gray-500">Email: </span>{user.email}</p>
          {user.dob && <p className="text-sm"><span className="text-gray-500">DOB: </span>{user.dob}</p>}
          {user.gender && (
            <p className="text-sm capitalize">
              <span className="text-gray-500">Gender: </span>
              {user.gender.replace(/_/g, " ")}
            </p>
          )}
          <button onClick={logout} className="mt-2 text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md">
            Log out
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Suggestions for you</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : sugs.length === 0 ? (
            <p className="text-sm text-gray-500">No pending suggestions.</p>
          ) : (
            <div className="space-y-3">
              {sugs.map((s) => (
                <div key={s.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                  <div>
                    <p className="font-medium">{s.suggesterName} suggests:</p>
                    {s.forDate && (
                      <p className="text-xs text-gray-500">
                        For {new Date(s.forDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                    )}
                  </div>
                  {s.note && <p className="text-sm text-gray-700 italic">"{s.note}"</p>}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {s.clothes.map((c) => (
                      <div key={c.id} className="bg-gray-50 rounded-lg overflow-hidden">
                        <div className="aspect-square">
                          <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="p-1.5 text-xs truncate">{c.name}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy === s.id}
                      onClick={() => respond(s.id, true)}
                      className="text-sm bg-brand-600 text-white px-3 py-1.5 rounded-md disabled:opacity-60"
                    >
                      Accept & wear
                    </button>
                    <button
                      disabled={busy === s.id}
                      onClick={() => respond(s.id, false)}
                      className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
