import { useEffect, useMemo, useState } from "react";
import PageShell, { PageTitle } from "../components/PageShell";
import ClothCard from "../components/ClothCard";
import WardrobeSwitcher from "../components/WardrobeSwitcher";
import SelectionTray from "../components/SelectionTray";
import SectionHeading from "../components/ui/SectionHeading";
import Surface from "../components/ui/Surface";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import EmptyState from "../components/ui/EmptyState";
import { GridSkeleton } from "../components/ui/Skeleton";
import { Input } from "../components/ui/Field";
import { ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import { Calendar, Close } from "../components/ui/icons";
import { api, type Cloth } from "../api";
import { useGuidedTour } from "../tour/GuidedTourProvider";

type PlanEntry = {
  id: string;
  wornOn: string;
  cloth: { id: string; name: string; category: string; imageUrl: string; status: "clean" | "worn" };
};

function formatDate(d: string, today: string) {
  if (d === today) return "Today";
  const date = new Date(d + "T00:00:00");
  const tomorrow = new Date(today + "T00:00:00");
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function Plan() {
  const today = new Date().toISOString().slice(0, 10);
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [clean, setClean] = useState<Cloth[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const confirm = useConfirm();
  const tour = useGuidedTour();

  async function load() {
    setError(null);
    try {
      const [p, c] = await Promise.all([
        api.get<{ plans: PlanEntry[] }>("/clothes/plans"),
        api.get<{ clothes: Cloth[] }>("/clothes?status=clean"),
      ]);
      setPlans(p.plans);
      setClean(c.clothes);
    } catch (err: any) {
      setError(err.message ?? "Could not load your plans");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const selected = useMemo(
    () => sel.map((id) => clean.find((c) => c.id === id)).filter(Boolean) as Cloth[],
    [sel, clean],
  );

  async function planOutfit() {
    if (sel.length === 0) return;
    setBusy(true);
    try {
      await api.post("/clothes/plan", { ids: sel, date });
      setSel([]);
      await load();
      toast(`Outfit planned for ${formatDate(date, today).toLowerCase()}`, { tone: "success" });
    } catch (err: any) {
      toast(err.message ?? "Could not save the plan", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan(id: string, name: string) {
    const ok = await confirm({
      title: "Cancel this plan?",
      body: `${name} goes back to your clean wardrobe.`,
      confirmLabel: "Cancel plan",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!ok) return;
    const snapshot = plans;
    setPlans((p) => p.filter((x) => x.id !== id));
    try {
      await api.delete(`/clothes/plans/${id}`);
      await load();
      toast("Plan cancelled", { tone: "success" });
    } catch (err: any) {
      setPlans(snapshot);
      toast(err.message ?? "Could not cancel", { tone: "error" });
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, PlanEntry[]>();
    for (const p of plans) {
      if (!m.has(p.wornOn)) m.set(p.wornOn, []);
      m.get(p.wornOn)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [plans]);

  return (
    <PageShell>
      <WardrobeSwitcher current="mine" />
      <PageTitle
        title="Plan outfits"
        subtitle="Pick pieces, pick a day. Planned items wait here until the day passes."
      />

      {error && <ErrorBanner onRetry={() => load()}>{error}</ErrorBanner>}

      {/* Date first — everything below is "what am I planning for this day". */}
      <Surface tone="peach" className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-white/70 grid place-items-center text-orange-700 shrink-0">
          <Calendar className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <label htmlFor="plan-date" className="block text-[13px] font-semibold">
            Planning for
          </label>
          <p className="text-[12px] text-ink/65">{formatDate(date, today)}</p>
        </div>
        <Input
          id="plan-date"
          data-tour-id="plan-date"
          type="date"
          min={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            tour.signal("plan:interacted");
          }}
          className="!w-auto max-w-[10.5rem] bg-white/80"
        />
      </Surface>

      {grouped.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Upcoming" count={plans.length} />
          {grouped.map(([d, items]) => (
            <div key={d} className="surface p-4">
              <h3 className="text-sm font-semibold">
                {formatDate(d, today)}
                <span className="ml-1.5 text-xs text-ink/60 font-normal">
                  {items.length} piece{items.length === 1 ? "" : "s"}
                </span>
              </h3>
              <ul className="flex gap-2.5 overflow-x-auto no-scrollbar mt-3 pb-1 -mx-1 px-1">
                {items.map((p) => (
                  <li key={p.id} className="relative shrink-0 w-20">
                    <img
                      src={p.cloth.imageUrl}
                      alt={p.cloth.name}
                      className="w-20 h-20 rounded-xl object-cover bg-ink/[0.05]"
                    />
                    <p className="text-[11px] text-ink/70 truncate mt-1">{p.cloth.name}</p>
                    <IconButton
                      label={`Cancel plan for ${p.cloth.name}`}
                      size="sm"
                      onClick={() => cancelPlan(p.id, p.cloth.name)}
                      className="absolute -top-1.5 -right-1.5 shadow-card"
                    >
                      <Close className="w-3.5 h-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading
          title="Choose pieces"
          hint={sel.length > 0 ? `${sel.length} selected` : "Tap to add to this outfit"}
        />
        {loading ? (
          <GridSkeleton count={6} />
        ) : clean.length === 0 ? (
          <EmptyState
            tone="butter"
            title="Nothing available to plan"
            body="Your clean wardrobe is empty — everything is worn or already planned."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {clean.map((c) => (
              <ClothCard
                key={c.id}
                cloth={c}
                selectable
                selected={sel.includes(c.id)}
                onClick={() => toggle(c.id)}
              />
            ))}
          </div>
        )}
      </section>

      <SelectionTray
        label="Outfit you're planning"
        items={selected}
        onRemove={(id) => setSel((p) => p.filter((x) => x !== id))}
        onClear={() => setSel([])}
      >
        <span className="text-[13px] text-ink/70 mr-auto">
          For <strong className="text-ink">{formatDate(date, today)}</strong>
        </span>
        <Button onClick={planOutfit} loading={busy}>
          Plan outfit
        </Button>
      </SelectionTray>
    </PageShell>
  );
}
