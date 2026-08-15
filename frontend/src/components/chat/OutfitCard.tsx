import { useMemo, useState } from "react";
import { api, type Cloth } from "../../api";
import { useTryOn } from "../../tryon";
import { useToast } from "../ui/Toast";
import Button from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { Calendar, Check, Sparkles } from "../ui/icons";
import type { Outfit } from "./parse";

/** Placeholder shown while an outfit block is still streaming in. */
export function OutfitCardSkeleton() {
  return (
    <div className="my-2 rounded-2xl border border-brand-200 bg-brand-50/60 p-3" aria-busy="true">
      <Skeleton className="h-3.5 w-32" />
      <div className="flex gap-2 mt-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="w-14 h-14 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-2.5 w-44 mt-2.5" />
    </div>
  );
}

export default function OutfitCard({
  outfit,
  wardrobe,
}: {
  outfit: Outfit;
  wardrobe: Map<string, Cloth>;
}) {
  const { setLook } = useTryOn();
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [plannedOn, setPlannedOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ids the model invented, or garments deleted since, simply don't appear.
  const resolved = useMemo(
    () => outfit.clothIds.map((id) => wardrobe.get(id)).filter(Boolean) as Cloth[],
    [outfit.clothIds, wardrobe],
  );
  const chosen = resolved.filter((c) => !excluded.has(c.id));
  const missing = outfit.clothIds.length - resolved.length;

  // Nothing resolved — fall back to prose rather than an empty card.
  if (resolved.length === 0) {
    return (
      <p className="my-1 text-[13px] text-ink/65 italic">
        {outfit.title}
        {outfit.why ? ` — ${outfit.why}` : ""} (those pieces aren't in your wardrobe any more)
      </p>
    );
  }

  function tryOnAll() {
    if (chosen.length === 0) return;
    setLook(chosen);
    toast(`${chosen.length} pieces ready in Try-on`, { tone: "success" });
  }

  async function plan() {
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/clothes/plan", { ids: chosen.map((c) => c.id), date });
      setPlannedOn(date);
      setPlanning(false);
      toast("Outfit planned", { tone: "success" });
    } catch (err: any) {
      setError(err?.message ?? "Could not plan that outfit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="my-2 rounded-2xl border border-brand-200 bg-white overflow-hidden">
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-lilac text-brand-700 grid place-items-center shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
          <h4 className="text-[14px] font-semibold leading-tight truncate">{outfit.title}</h4>
        </div>
        {outfit.why && <p className="text-[12.5px] text-ink/70 leading-snug mt-1.5">{outfit.why}</p>}
      </div>

      <ul className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2.5">
        {resolved.map((c) => {
          const off = excluded.has(c.id);
          const inner = (
            <>
              <span className="relative block">
                <img
                  src={c.imageUrl}
                  alt={c.name}
                  className={`w-14 h-14 rounded-xl object-cover bg-ink/[0.05] transition-opacity ${
                    off ? "opacity-35" : ""
                  }`}
                />
                {editing && (
                  <span
                    className={`absolute -top-1 -right-1 w-5 h-5 rounded-full grid place-items-center border-2 border-white ${
                      off ? "bg-ink/25" : "bg-brand-500 text-white"
                    }`}
                  >
                    {!off && <Check className="w-3 h-3" />}
                  </span>
                )}
              </span>
              <span className={`block text-[10.5px] truncate mt-1 ${off ? "text-ink/40" : "text-ink/70"}`}>
                {c.name}
              </span>
              <span className="block text-[9.5px] text-ink/45 truncate capitalize">{c.category}</span>
            </>
          );
          return (
            <li key={c.id} className="shrink-0 w-14">
              {editing ? (
                <button
                  type="button"
                  aria-pressed={!off}
                  aria-label={`${off ? "Include" : "Remove"} ${c.name}`}
                  onClick={() =>
                    setExcluded((p) => {
                      const n = new Set(p);
                      n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                      return n;
                    })
                  }
                  className="block text-left w-full"
                >
                  {inner}
                </button>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>

      {missing > 0 && (
        <p className="px-3 pb-1 text-[11.5px] text-ink/55">
          {missing} suggested piece{missing === 1 ? "" : "s"} couldn't be found in your wardrobe.
        </p>
      )}

      {plannedOn ? (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl bg-mint px-3 py-2 text-[12.5px] text-emerald-900">
          <Check className="w-4 h-4 shrink-0" />
          Planned for{" "}
          {plannedOn === today
            ? "today"
            : new Date(plannedOn + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
        </div>
      ) : planning ? (
        <div className="px-3 pb-3 space-y-2">
          <label className="block">
            <span className="text-[11.5px] font-medium text-ink/70">Wear it on</span>
            <input
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full h-10 bg-white border border-ink/12 rounded-xl px-3 text-[13px]"
            />
          </label>
          {error && (
            <p role="alert" className="text-[12px] text-coral">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPlanning(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={plan} loading={busy} disabled={chosen.length === 0}>
              Plan {chosen.length} piece{chosen.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          <Button
            size="sm"
            onClick={tryOnAll}
            disabled={chosen.length === 0}
            leading={<Sparkles className="w-3.5 h-3.5" />}
          >
            Try on outfit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPlanning(true)}
            disabled={chosen.length === 0}
            leading={<Calendar className="w-3.5 h-3.5" />}
          >
            Plan outfit
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit selection"}
          </Button>
        </div>
      )}
    </div>
  );
}
