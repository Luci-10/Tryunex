import type { ReactNode } from "react";
import type { Cloth } from "../api";
import IconButton from "./ui/IconButton";
import { Close } from "./ui/icons";
import ProtectedPhoto from "./ui/ProtectedPhoto";

/**
 * Persistent bottom tray for multi-select flows (plan an outfit, suggest to a
 * friend). Slides in only once something is selected, sits above the phone
 * tab bar, and always shows what's selected plus one primary action.
 */
export default function SelectionTray({
  items,
  onRemove,
  onClear,
  children,
  label,
}: {
  items: Cloth[] | { id: string; name: string; imageUrl: string }[];
  onRemove: (id: string) => void;
  onClear: () => void;
  /** The primary action (and any inline controls like a date picker). */
  children: ReactNode;
  label: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      role="region"
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-30 md:bottom-4 md:inset-x-4 pointer-events-none"
    >
      <div className="mx-auto w-full md:max-w-3xl pointer-events-auto">
        <div className="bg-white border-t md:border border-ink/10 md:rounded-sheet shadow-lift px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3 mb-[calc(4rem+env(safe-area-inset-bottom))] md:mb-0 animate-sheet-up">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[13px] font-semibold">
              {items.length} selected
            </p>
            <button
              type="button"
              onClick={onClear}
              className="tap-44 text-[13px] text-ink/65 hover:text-ink underline underline-offset-2"
            >
              Clear
            </button>
          </div>

          <ul className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {items.map((c) => (
              <li key={c.id} className="relative shrink-0">
                <ProtectedPhoto
                  scope="cloth"
                  id={c.id}
                  src={c.imageUrl}
                  alt={c.name}
                  className="w-14 h-14 rounded-xl object-cover bg-ink/[0.05]"
                />
                <IconButton
                  label={`Remove ${c.name}`}
                  size="sm"
                  onClick={() => onRemove(c.id)}
                  className="absolute -top-1.5 -right-1.5 shadow-card"
                >
                  <Close className="w-3.5 h-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
