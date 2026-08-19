import type { Cloth } from "../api";
import { useTryOn } from "../tryon";
import { Badge } from "./ui/Chip";
import { Check, Sparkles } from "./ui/icons";
import ProtectedPhoto from "./ui/ProtectedPhoto";

// "Worn today" / "yesterday" / "N days ago" / "Never worn". Server dates are
// YYYY-MM-DD; compare against local midnight to avoid a timezone off-by-one.
export function lastWornLabel(lastWornOn: string | null | undefined): string {
  if (!lastWornOn) return "Never worn";
  const worn = new Date(lastWornOn + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - worn.getTime()) / 86400000);
  if (days <= 0) return "Worn today";
  if (days === 1) return "Worn yesterday";
  if (days < 30) return `Worn ${days} days ago`;
  return `Worn ${Math.floor(days / 30)} mo ago`;
}

export default function ClothCard({
  cloth,
  selected,
  onClick,
  onMarkClean,
  onWearToday,
  canTryOn = true,
  selectable = false,
}: {
  cloth: Cloth;
  selected?: boolean;
  onClick?: () => void;
  onMarkClean?: (id: string) => void;
  onWearToday?: (id: string) => void;
  // Hidden on a friend's wardrobe when the owner didn't grant try-on access.
  canTryOn?: boolean;
  /** Renders the card as a selection toggle rather than a link to detail. */
  selectable?: boolean;
}) {
  const { tryOn } = useTryOn();
  const interactive = Boolean(onClick);

  return (
    <div
      className={`relative rounded-card bg-white border shadow-card overflow-hidden flex flex-col transition-[box-shadow,border-color] ${
        selected ? "border-brand-500 ring-2 ring-brand-500/40" : "border-ink/[0.06]"
      }`}
    >
      {/* One full-card hit target underneath the overlay controls. */}
      {interactive && (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selectable ? Boolean(selected) : undefined}
          aria-label={
            selectable
              ? `${selected ? "Deselect" : "Select"} ${cloth.name}`
              : `Open ${cloth.name}`
          }
          className="absolute inset-0 z-0"
        />
      )}

      <div className="relative aspect-square bg-ink/[0.04]">
        <ProtectedPhoto
          scope="cloth"
          id={cloth.id}
          alt={cloth.name}
          className="w-full h-full object-cover"
        />

        {selected && (
          <span className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-brand-500 text-white grid place-items-center shadow">
            <Check className="w-4 h-4" />
          </span>
        )}

        {cloth.status === "worn" && (
          <span className="absolute top-2 right-2 z-10">
            <Badge tone="peach">Worn</Badge>
          </span>
        )}

        {/* Quick actions are always visible — nothing here depends on hover.
            Two cards fit a 360px screen, so the try-on control is icon-only
            (with a label for assistive tech) and the text action stays short. */}
        <div className="absolute inset-x-2 bottom-2 z-10 flex items-end justify-between gap-1.5 pointer-events-none">
          {canTryOn ? (
            <button
              type="button"
              aria-label={`Try on ${cloth.name}`}
              title="Try on"
              onClick={(e) => {
                e.stopPropagation();
                tryOn(cloth);
              }}
              className="tap-44 pointer-events-auto grid place-items-center w-8 h-8 rounded-full bg-white/95 text-brand-700 shadow-card backdrop-blur-sm active:scale-95 transition-transform shrink-0"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          ) : (
            <span />
          )}

          {onWearToday && cloth.status === "clean" && (
            <button
              type="button"
              aria-label={`Wear ${cloth.name} today`}
              onClick={(e) => {
                e.stopPropagation();
                onWearToday(cloth.id);
              }}
              className="pointer-events-auto h-8 px-2.5 rounded-full bg-brand-500/95 text-white text-xs font-semibold shadow-card backdrop-blur-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
            >
              Wear
            </button>
          )}

          {onMarkClean && cloth.status === "worn" && (
            <button
              type="button"
              aria-label={`Mark ${cloth.name} as clean`}
              onClick={(e) => {
                e.stopPropagation();
                onMarkClean(cloth.id);
              }}
              className="pointer-events-auto inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-mint text-emerald-800 text-xs font-semibold shadow-card active:scale-95 transition-transform whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              Clean
            </button>
          )}
        </div>
      </div>

      <div className="p-3 pt-2.5 pointer-events-none">
        <div className="text-[10px] uppercase tracking-wider text-brand-700 font-semibold">
          {cloth.category}
        </div>
        <div className="text-sm font-medium truncate mt-0.5">{cloth.name}</div>
        <div className="text-[11px] text-ink/65 mt-0.5">{lastWornLabel(cloth.lastWornOn)}</div>
      </div>
    </div>
  );
}
