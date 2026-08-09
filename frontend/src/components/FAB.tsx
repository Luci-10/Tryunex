import { Plus } from "./ui/icons";

/**
 * Branded "add" action. Phones only — desktop puts the same action in the
 * page header, where there's room for a labelled button. Sits above the
 * bottom tab bar and clears the Capacitor home indicator.
 */
export default function FAB({ onClick, label = "Add a piece" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="md:hidden fixed right-4 bottom-[calc(10rem+env(safe-area-inset-bottom))] z-30 w-14 h-14 rounded-full bg-brand-500 hover:bg-brand-600 text-white shadow-lift grid place-items-center transition-transform active:scale-95"
    >
      <Plus className="w-7 h-7" strokeWidth={2.2} />
    </button>
  );
}
