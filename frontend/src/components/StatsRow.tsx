export default function StatsRow({
  total,
  clean,
  worn,
  topCategory,
}: {
  total: number;
  clean: number;
  worn: number;
  topCategory: { name: string; count: number } | null;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat label="Total" value={total} />
      <Stat label="Clean" value={clean} accent="emerald" />
      <Stat label="Worn" value={worn} accent="amber" />
      <Stat
        label="Most owned"
        value={topCategory ? `${topCategory.count}` : "—"}
        sub={topCategory ? topCategory.name : undefined}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "emerald" | "amber";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
        ? "text-amber-700"
        : "text-brand-700";
  return (
    <div className="bg-white rounded-xl shadow-sm p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 capitalize">{sub}</div>}
    </div>
  );
}
