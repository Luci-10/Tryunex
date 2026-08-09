import type { ReactNode } from "react";

export default function SectionHeading({
  title,
  count,
  hint,
  action,
  as: Tag = "h2",
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <Tag className="text-[15px] font-semibold tracking-tight">
          {title}
          {count !== undefined && <span className="ml-1.5 text-ink/55 font-normal">{count}</span>}
        </Tag>
        {hint && <p className="text-xs text-ink/65 mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
