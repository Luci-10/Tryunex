import type { Cloth } from "../api";

// "Worn today" / "Worn yesterday" / "Worn N days ago" / "Never worn".
// Dates from the server are YYYY-MM-DD; compare against local midnight to
// avoid timezone-induced off-by-one.
function lastWornLabel(lastWornOn: string | null | undefined): string {
  if (!lastWornOn) return "Never worn";
  const worn = new Date(lastWornOn + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - worn.getTime()) / 86400000);
  if (days <= 0) return "Worn today";
  if (days === 1) return "Worn yesterday";
  return `Worn ${days} days ago`;
}

export default function ClothCard({
  cloth,
  selected,
  onClick,
  onMarkClean,
  onWearToday,
}: {
  cloth: Cloth;
  selected?: boolean;
  onClick?: () => void;
  onMarkClean?: (id: string) => void;
  onWearToday?: (id: string) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col group ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""} ${selected ? "ring-2 ring-brand-500" : ""}`}
    >
      <div className="aspect-square bg-gray-100 relative">
        <img src={cloth.imageUrl} alt={cloth.name} className="w-full h-full object-cover" />
        <span
          className={`absolute top-2 right-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium ${cloth.status === "clean" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
        >
          {cloth.status}
        </span>
        {selected && (
          <span className="absolute top-2 left-2 bg-brand-600 text-white text-xs px-2 py-0.5 rounded-full">✓</span>
        )}
        {onWearToday && cloth.status === "clean" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onWearToday(cloth.id);
            }}
            className="absolute bottom-2 right-2 bg-brand-600/95 hover:bg-brand-700 text-white text-xs font-medium px-2.5 py-1 rounded-full shadow-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity sm:opacity-100"
            aria-label="Wear today"
          >
            Wear today
          </button>
        )}
      </div>
      <div className="p-2.5 flex-1 flex flex-col gap-0.5">
        <div className="text-sm font-medium truncate">{cloth.name}</div>
        <div className="text-xs text-gray-500 capitalize">{cloth.category}</div>
        <div className="text-[11px] text-gray-400">{lastWornLabel(cloth.lastWornOn)}</div>
        {onMarkClean && cloth.status === "worn" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkClean(cloth.id);
            }}
            className="mt-1 text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 self-start"
          >
            Mark clean
          </button>
        )}
      </div>
    </div>
  );
}
