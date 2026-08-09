import { Badge } from "./ui/Chip";
import { Avatar } from "./Nav";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function message(total: number, clean: number, worn: number) {
  if (total === 0) return "Let's get your first piece in.";
  if (clean === 0) return "Everything's in the basket — laundry day?";
  if (worn === 0) return "Fresh wardrobe. Anything goes today.";
  if (clean <= 3) return `Only ${clean} clean piece${clean === 1 ? "" : "s"} left.`;
  return `${clean} clean pieces ready to wear.`;
}

/**
 * Compact editorial strip: who you are, what you own, and one contextual
 * line. Deliberately not a dashboard — three numbers, one sentence.
 */
export default function WardrobeHero({
  name,
  total,
  clean,
  worn,
}: {
  name: string;
  total: number;
  clean: number;
  worn: number;
}) {
  return (
    <section className="rounded-card border border-brand-200/70 bg-gradient-to-br from-lilac via-lilac/70 to-white p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink/65 leading-none">{greeting()},</p>
          <h1 className="text-[19px] font-bold tracking-tight truncate mt-1">{name}</h1>
        </div>
        <Badge tone="mint" className="shrink-0">
          {clean} clean
        </Badge>
      </div>

      <p className="text-sm text-ink/70 mt-3">{message(total, clean, worn)}</p>

      <dl className="flex items-center gap-5 mt-3 pt-3 border-t border-brand-300/30">
        <Stat label="Pieces" value={total} />
        <Stat label="Clean" value={clean} />
        <Stat label="Worn" value={worn} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink/65">{label}</dt>
      <dd className="text-lg font-semibold leading-tight">{value}</dd>
    </div>
  );
}
