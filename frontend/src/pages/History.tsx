import { useEffect, useMemo, useState } from "react";
import PageShell, { PageTitle } from "../components/PageShell";
import EmptyState from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/Field";
import { Clock } from "../components/ui/icons";
import { api } from "../api";

type Row = {
  id: string;
  wornOn: string;
  clothName: string;
  clothImage: string;
  category: string;
};

function dayLabel(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date + "T00:00:00");
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function History() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const r = await api.get<{ history: Row[] }>("/history");
      setRows(r.history);
    } catch (err: any) {
      setError(err.message ?? "Could not load your history");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      if (!m.has(r.wornOn)) m.set(r.wornOn, []);
      m.get(r.wornOn)!.push(r);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <PageShell>
      <PageTitle title="Wear history" subtitle="Everything you've worn, newest first." />

      {error && <ErrorBanner onRetry={() => load()}>{error}</ErrorBanner>}

      {loading ? (
        <div className="space-y-6" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2.5">
              <Skeleton className="h-3.5 w-32" />
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2.5">
                {Array.from({ length: 4 }, (_, j) => (
                  <Skeleton key={j} className="aspect-square rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : byDate.length === 0 ? (
        <EmptyState
          icon={<Clock className="w-7 h-7" />}
          title="No history yet"
          body="Mark something as worn and it starts showing up here."
        />
      ) : (
        // A timeline: a dotted rail on the left, one node per day.
        <ol className="relative space-y-6 pl-6">
          <span
            aria-hidden
            className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-brand-300 via-brand-200 to-transparent"
          />
          {byDate.map(([date, items]) => (
            <li key={date} className="relative">
              <span
                aria-hidden
                className="absolute -left-6 top-1 w-[15px] h-[15px] rounded-full bg-white border-[3px] border-brand-400"
              />
              <h2 className="text-sm font-semibold">
                {dayLabel(date)}
                <span className="ml-1.5 text-xs text-ink/60 font-normal">
                  {items.length} piece{items.length === 1 ? "" : "s"}
                </span>
              </h2>
              <ul className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2.5 mt-2.5">
                {items.map((i) => (
                  <li key={i.id} className="rounded-xl overflow-hidden bg-white border border-ink/[0.06] shadow-card">
                    <img
                      src={i.clothImage}
                      alt={i.clothName}
                      loading="lazy"
                      className="w-full aspect-square object-cover bg-ink/[0.04]"
                    />
                    <p className="text-[11px] font-medium truncate px-2 py-1.5">{i.clothName}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  );
}
