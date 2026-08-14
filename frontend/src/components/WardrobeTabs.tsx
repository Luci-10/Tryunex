import { NavLink } from "react-router-dom";
import { Basket, Shirt } from "./ui/icons";

/**
 * Clean / Worn switch. Laundry lost its permanent nav slot, so this is how
 * it stays one tap away — it sits at the top of both the wardrobe and the
 * laundry page and simply routes between them.
 */
export default function WardrobeTabs({
  cleanCount,
  wornCount,
}: {
  cleanCount?: number;
  wornCount?: number;
}) {
  return (
    <div
      role="group"
      aria-label="Show clean or worn pieces"
      className="inline-flex p-1 rounded-full bg-ink/[0.05] border border-ink/[0.06]"
    >
      <Tab to="/" end icon={Shirt} label="Clean" count={cleanCount} />
      <Tab to="/worn" icon={Basket} label="Worn" count={wornCount} />
    </div>
  );
}

function Tab({
  to,
  end,
  icon: Icon,
  label,
  count,
}: {
  to: string;
  end?: boolean;
  icon: typeof Shirt;
  label: string;
  count?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm whitespace-nowrap transition-colors ${
          isActive
            ? "bg-white text-ink font-semibold shadow-card"
            : "text-ink/65 hover:text-ink"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="w-4 h-4" />
          {label}
          {count !== undefined && (
            <span className={isActive ? "text-ink/45" : "text-ink/40"}>{count}</span>
          )}
        </>
      )}
    </NavLink>
  );
}
