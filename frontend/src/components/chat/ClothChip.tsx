import { useState } from "react";
import { api, type Cloth } from "../../api";
import { useTryOn } from "../../tryon";
import { useChat } from "../../chat";
import { Calendar, Check, Sparkles } from "../ui/icons";
import ProtectedPhoto from "../ui/ProtectedPhoto";

/** A single garment the assistant referenced, with the actions that matter. */
export default function ClothChip({ cloth }: { cloth: Cloth }) {
  const today = new Date().toISOString().slice(0, 10);
  const { tryOn } = useTryOn();
  const { setAttached } = useChat();

  const [planning, setPlanning] = useState(false);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [plannedOn, setPlannedOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function plan() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/clothes/plan", { ids: [cloth.id], date });
      setPlannedOn(date);
      setPlanning(false);
    } catch (err: any) {
      setError(err?.message ?? "Could not plan that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="block my-2 bg-white border border-ink/10 rounded-xl p-2">
      <span className="flex items-center gap-2">
        <ProtectedPhoto
          scope="cloth"
          id={cloth.id}
          alt={cloth.name}
          className="w-11 h-11 rounded-lg object-cover bg-ink/[0.05] shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-medium truncate">{cloth.name}</span>
          <span className="block text-[11px] text-ink/55 capitalize">
            {cloth.category}
            {cloth.status === "worn" && <span className="text-orange-700"> · in the wash</span>}
          </span>
        </span>
      </span>

      {plannedOn ? (
        <span className="mt-2 flex items-center gap-1.5 rounded-lg bg-mint px-2.5 py-1.5 text-[11.5px] text-emerald-900">
          <Check className="w-3.5 h-3.5 shrink-0" />
          Planned for{" "}
          {plannedOn === today
            ? "today"
            : new Date(plannedOn + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
        </span>
      ) : planning ? (
        <span className="mt-2 block">
          <span className="flex items-center gap-1.5">
            <input
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label={`Date to plan ${cloth.name}`}
              className="flex-1 min-w-0 h-9 text-[12px] border border-ink/12 rounded-lg px-2"
            />
            <button
              type="button"
              disabled={busy}
              onClick={plan}
              className="h-9 px-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-[12px] font-medium disabled:opacity-50"
            >
              {busy ? "…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setPlanning(false)}
              className="h-9 px-2.5 rounded-lg text-[12px] text-ink/65 hover:bg-ink/[0.05]"
            >
              Cancel
            </button>
          </span>
          {error && (
            <span role="alert" className="block text-[11.5px] text-coral mt-1">
              {error}
            </span>
          )}
        </span>
      ) : (
        <span className="mt-2 flex flex-wrap gap-1.5">
          <Action onClick={() => tryOn(cloth)} icon={<Sparkles className="w-3.5 h-3.5" />}>
            Try on
          </Action>
          <Action onClick={() => setPlanning(true)} icon={<Calendar className="w-3.5 h-3.5" />}>
            Plan
          </Action>
          {/* Keeps the conversation pointed at this garment. */}
          <Action onClick={() => setAttached(cloth)}>Style this</Action>
        </span>
      )}
    </span>
  );
}

function Action({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap-44 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 active:bg-brand-200 text-brand-700 text-[12px] font-medium transition-colors"
    >
      {icon}
      {children}
    </button>
  );
}
