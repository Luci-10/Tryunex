import { useEffect, useState } from "react";
import PageShell, { PageTitle } from "../components/PageShell";
import SectionHeading from "../components/ui/SectionHeading";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { RowSkeleton } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { Avatar } from "../components/Nav";
import { useSignOut } from "../components/ProfileMenu";
import { Check, Close, Logout, Sparkles } from "../components/ui/icons";
import { api } from "../api";
import { useAuth } from "../auth";

type Sug = {
  id: string;
  note: string | null;
  forDate: string | null;
  suggesterName: string;
  clothes: { id: string; name: string; imageUrl: string }[];
};

export default function Account() {
  const { user } = useAuth();
  const { toast } = useToast();
  const logout = useSignOut();
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const r = await api.get<{ suggestions: Sug[] }>("/suggestions");
      setSugs(r.suggestions);
    } catch (err: any) {
      setError(err.message ?? "Could not load suggestions");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function respond(s: Sug, accept: boolean) {
    setBusy(s.id);
    try {
      await api.post(`/suggestions/${s.id}/respond`, { accept });
      setSugs((p) => p.filter((x) => x.id !== s.id));
      toast(accept ? "Accepted — added to your plans" : "Suggestion declined", { tone: "success" });
    } catch (err: any) {
      toast(err.message ?? "Could not respond", { tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  if (!user) return null;

  return (
    <PageShell width="narrow">
      <PageTitle title="Account" />

      <section className="rounded-card border border-brand-200/70 bg-gradient-to-br from-lilac via-lilac/60 to-white p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{user.name}</p>
            <p className="text-[13px] text-ink/65 truncate">{user.email}</p>
          </div>
        </div>
        {(user.dob || user.gender) && (
          <dl className="flex gap-6 mt-3 pt-3 border-t border-brand-300/30 text-[13px]">
            {user.dob && (
              <div>
                <dt className="text-ink/65 text-[11px] uppercase tracking-wide">Born</dt>
                <dd className="font-medium mt-0.5">
                  {new Date(user.dob + "T00:00:00").toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </dd>
              </div>
            )}
            {user.gender && (
              <div>
                <dt className="text-ink/65 text-[11px] uppercase tracking-wide">Gender</dt>
                <dd className="font-medium mt-0.5 capitalize">{user.gender.replace(/_/g, " ")}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Suggestions for you" count={sugs.length} as="h2" />

        {error && <ErrorBanner onRetry={() => load()}>{error}</ErrorBanner>}

        {loading ? (
          <RowSkeleton count={2} />
        ) : sugs.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="w-7 h-7" />}
            title="No suggestions waiting"
            body="When a friend suggests an outfit, it lands here for you to accept."
          />
        ) : (
          <div className="space-y-3">
            {sugs.map((s) => (
              <article key={s.id} className="rounded-card border border-sky/80 bg-sky/40 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={s.suggesterName} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{s.suggesterName} suggests an outfit</p>
                    {s.forDate && (
                      <p className="text-[12px] text-ink/65">
                        For{" "}
                        {new Date(s.forDate + "T00:00:00").toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {s.note && (
                  <p className="text-[13px] text-ink/70 italic bg-white/70 rounded-xl px-3 py-2">
                    “{s.note}”
                  </p>
                )}

                <ul className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                  {s.clothes.map((c) => (
                    <li key={c.id} className="shrink-0 w-20">
                      <img
                        src={c.imageUrl}
                        alt={c.name}
                        className="w-20 h-20 rounded-xl object-cover bg-white"
                      />
                      <p className="text-[11px] text-ink/70 truncate mt-1">{c.name}</p>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <Button
                    block
                    loading={busy === s.id}
                    onClick={() => respond(s, true)}
                    leading={<Check className="w-4 h-4" />}
                  >
                    Accept
                  </Button>
                  <Button
                    block
                    variant="secondary"
                    disabled={busy === s.id}
                    onClick={() => respond(s, false)}
                    leading={<Close className="w-4 h-4" />}
                  >
                    Decline
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Quiet danger zone — visually separated, never adjacent to a save. */}
      <section className="pt-2">
        <div className="rounded-card border border-dashed border-coral/35 p-4">
          <h2 className="text-sm font-semibold">Danger zone</h2>
          <p className="text-[13px] text-ink/65 mt-0.5 mb-3">
            Signing out clears this device. Your wardrobe stays safe.
          </p>
          <Button variant="destructive" onClick={() => void logout()} leading={<Logout className="w-4 h-4" />}>
            Sign out
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
