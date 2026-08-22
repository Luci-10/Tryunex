import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import ClothCard from "../components/ClothCard";
import WardrobeSwitcher from "../components/WardrobeSwitcher";
import SelectionTray from "../components/SelectionTray";
import SectionHeading from "../components/ui/SectionHeading";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { GridSkeleton } from "../components/ui/Skeleton";
import { Badge } from "../components/ui/Chip";
import { Input, ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { Avatar } from "../components/Nav";
import { permissionTone } from "./Shared";
import ProtectedPhoto from "../components/ui/ProtectedPhoto";
import { api, type Cloth } from "../api";

type Permission = "view" | "suggest" | "edit";

type PlanEntry = {
  id: string;
  wornOn: string;
  cloth: { id: string; name: string; category: string; status: "clean" | "worn" };
};

type FriendData = {
  permission: Permission;
  allowTryon: boolean;
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

const PERMISSION_LINE: Record<Permission, string> = {
  view: "You can browse this wardrobe.",
  suggest: "You can suggest outfits — they approve.",
  edit: "You can plan outfits directly.",
};

export default function Friend() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const { toast } = useToast();

  const [data, setData] = useState<FriendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [sel, setSel] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setAccessError(null);
    try {
      const r = await api.get<FriendData>(`/friends/${ownerId}/wardrobe`);
      setData(r);
    } catch (err: any) {
      setAccessError(err.message ?? "Could not open this wardrobe");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setSel([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  function toggle(id: string) {
    setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const selected = useMemo(
    () => (data ? (sel.map((id) => data.clothes.find((c) => c.id === id)).filter(Boolean) as Cloth[]) : []),
    [sel, data],
  );

  async function submit() {
    if (!data || sel.length === 0) return;
    setBusy(true);
    try {
      if (data.permission === "edit") {
        await api.post(`/friends/${ownerId}/plan`, { ids: sel, date });
        toast("Outfit planned", { tone: "success" });
        await load();
      } else {
        await api.post(`/friends/${ownerId}/suggest`, {
          clothIds: sel,
          note: note || null,
          forDate: date,
        });
        toast(`Suggestion sent to ${data.owner.name}`, { tone: "success" });
        setNote("");
      }
      setSel([]);
    } catch (err: any) {
      toast(err.message ?? "Could not send that", { tone: "error" });
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
      <PageShell>
        <WardrobeSwitcher current={ownerId ?? "mine"} />
        <GridSkeleton count={6} />
      </PageShell>
    );
  }

  if (accessError || !data) {
    return (
      <PageShell>
        <WardrobeSwitcher current={ownerId ?? "mine"} />
        <EmptyState
          tone="butter"
          title="No access to this wardrobe"
          body={accessError ?? "The owner may have removed your access."}
        />
      </PageShell>
    );
  }

  const canAct = data.permission !== "view";
  const actionLabel = data.permission === "edit" ? "Plan outfit" : "Send suggestion";

  return (
    <PageShell>
      <WardrobeSwitcher current={ownerId ?? "mine"} />

      {/* Whose wardrobe this is, and exactly what you're allowed to do here. */}
      <section className="rounded-card border border-sky/80 bg-gradient-to-br from-sky via-sky/60 to-white p-4 flex items-center gap-3">
        <Avatar name={data.owner.name} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-bold tracking-tight truncate">
            {data.owner.name}'s wardrobe
          </h1>
          <p className="text-[13px] text-ink/70 mt-0.5">{PERMISSION_LINE[data.permission]}</p>
        </div>
        <span className="flex flex-col items-end gap-1 shrink-0">
          <Badge tone={permissionTone(data.permission) as any}>{data.permission}</Badge>
          {data.allowTryon && <Badge tone="lilac">try-on</Badge>}
        </span>
      </section>

      {accessError && <ErrorBanner onRetry={() => load()}>{accessError}</ErrorBanner>}

      {groupedPlans.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Their upcoming plans" as="h2" />
          {groupedPlans.map(([d, items]) => (
            <div key={d} className="surface p-4">
              <h3 className="text-sm font-semibold">
                {formatDate(d, today)}
                <span className="ml-1.5 text-xs text-ink/60 font-normal">
                  {items.length} piece{items.length === 1 ? "" : "s"}
                </span>
              </h3>
              <ul className="flex gap-2.5 overflow-x-auto no-scrollbar mt-3 pb-1">
                {items.map((p) => (
                  <li key={p.id} className="shrink-0 w-20">
                    <ProtectedPhoto
                      scope="cloth"
                      id={p.cloth.id}
                      alt={p.cloth.name}
                      className="w-20 h-20 rounded-xl object-cover bg-ink/[0.05]"
                    />
                    <p className="text-[11px] text-ink/70 truncate mt-1">{p.cloth.name}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading
          title="Their wardrobe"
          count={data.clothes.length}
          hint={canAct ? "Tap pieces to build an outfit" : undefined}
          as="h2"
        />
        {data.clothes.length === 0 ? (
          <EmptyState tone="butter" title="Nothing clean right now" body="Check back after laundry day." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {data.clothes.map((c) => (
              <ClothCard
                key={c.id}
                cloth={c}
                selectable={canAct}
                selected={sel.includes(c.id)}
                onClick={canAct ? () => toggle(c.id) : undefined}
                canTryOn={data.allowTryon}
              />
            ))}
          </div>
        )}
      </section>

      {canAct && (
        <SelectionTray
          label={data.permission === "edit" ? "Outfit you're planning" : "Outfit you're suggesting"}
          items={selected}
          onRemove={(id) => setSel((p) => p.filter((x) => x !== id))}
          onClear={() => setSel([])}
        >
          <Input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date for this outfit"
            className="!w-auto max-w-[10.5rem]"
          />
          {data.permission === "suggest" && (
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              aria-label="Note for your suggestion"
              className="flex-1 min-w-[10rem]"
            />
          )}
          <Button onClick={submit} loading={busy} className="ml-auto">
            {actionLabel}
          </Button>
        </SelectionTray>
      )}
    </PageShell>
  );
}
