import type { ReactNode } from "react";
import Button from "./Button";

/**
 * Empty states get one line of explanation and exactly one primary action —
 * never a wall of text.
 */
export default function EmptyState({
  icon,
  title,
  body,
  action,
  tone = "lilac",
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  tone?: "lilac" | "mint" | "butter" | "sky";
}) {
  const rings = {
    lilac: "bg-lilac text-brand-600",
    mint: "bg-mint text-emerald-700",
    butter: "bg-butter text-amber-700",
    sky: "bg-sky text-blue-700",
  };
  return (
    <div className="surface px-6 py-10 text-center flex flex-col items-center gap-3">
      {icon && (
        <div className={`w-14 h-14 rounded-full grid place-items-center ${rings[tone]}`}>{icon}</div>
      )}
      <div>
        <h3 className="font-semibold text-[15px]">{title}</h3>
        {body && <p className="text-sm text-ink/65 mt-1 max-w-xs mx-auto leading-relaxed">{body}</p>}
      </div>
      {action && (
        <Button onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  );
}
