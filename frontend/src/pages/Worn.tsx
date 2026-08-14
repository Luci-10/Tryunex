import { useEffect, useState } from "react";
import PageShell, { PageTitle } from "../components/PageShell";
import ClothCard from "../components/ClothCard";
import WardrobeTabs from "../components/WardrobeTabs";
import Button from "../components/ui/Button";
import Surface from "../components/ui/Surface";
import EmptyState from "../components/ui/EmptyState";
import { GridSkeleton } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import { Basket, Refresh } from "../components/ui/icons";
import { api, type Cloth } from "../api";

export default function Worn() {
  const [worn, setWorn] = useState<Cloth[]>([]);
  const [cleanCount, setCleanCount] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const confirm = useConfirm();

  async function load() {
    setError(null);
    try {
      const [w, c] = await Promise.all([
        api.get<{ clothes: Cloth[] }>("/clothes?status=worn"),
        api.get<{ clothes: Cloth[] }>("/clothes?status=clean"),
      ]);
      setWorn(w.clothes);
      setCleanCount(c.clothes.length);
    } catch (err: any) {
      setError(err.message ?? "Could not load your worn pile");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function reset() {
    const ok = await confirm({
      title: "Did the laundry?",
      body: `All ${worn.length} piece${worn.length === 1 ? "" : "s"} go back to your clean wardrobe.`,
      confirmLabel: "Yes, reset all",
    });
    if (!ok) return;
    setBusy(true);
    const snapshot = worn;
    setWorn([]);
    try {
      await api.post("/clothes/reset");
      toast(`${snapshot.length} piece${snapshot.length === 1 ? "" : "s"} back in the wardrobe`, {
        tone: "success",
      });
    } catch (err: any) {
      setWorn(snapshot);
      toast(err.message ?? "Could not reset", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function markClean(id: string) {
    const item = worn.find((c) => c.id === id);
    setWorn((p) => p.filter((c) => c.id !== id));
    try {
      await api.post(`/clothes/${id}/clean`);
      toast(item ? `${item.name} is clean again` : "Marked clean", {
        tone: "success",
        action: {
          label: "Undo",
          onClick: async () => {
            await api.post("/clothes/wear", { ids: [id] });
            await load();
          },
        },
      });
    } catch (err: any) {
      await load();
      toast(err.message ?? "Could not mark clean", { tone: "error" });
    }
  }

  return (
    <PageShell>
      <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
        <WardrobeTabs cleanCount={cleanCount} wornCount={worn.length} />
      </div>

      <PageTitle
        title="Laundry basket"
        subtitle="Everything you've worn since the last reset."
      />

      {error && <ErrorBanner onRetry={() => load()}>{error}</ErrorBanner>}

      {!loading && worn.length > 0 && (
        <Surface tone="peach" className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            🧺
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {worn.length} piece{worn.length === 1 ? "" : "s"} waiting
            </p>
            <p className="text-[13px] text-ink/70">Reset the whole basket, or clean pieces one by one.</p>
          </div>
          <Button size="sm" onClick={reset} loading={busy} leading={<Refresh className="w-4 h-4" />}>
            Reset all
          </Button>
        </Surface>
      )}

      {loading ? (
        <GridSkeleton count={4} />
      ) : worn.length === 0 ? (
        <EmptyState
          tone="mint"
          icon={<Basket className="w-7 h-7" />}
          title="Basket's empty"
          body="Nothing to wash — every piece in your wardrobe is clean."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {worn.map((c) => (
            <ClothCard key={c.id} cloth={c} onMarkClean={markClean} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
