import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import IconButton from "./IconButton";
import { Close } from "./icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Sheets can stack (e.g. the photo-access explainer over the add form).
// Escape must only close the topmost one, so each open sheet registers here.
const stack: symbol[] = [];

/**
 * One dialog for the whole app: a bottom sheet on phones, a centered modal
 * from `sm` up. Closes on Escape, on backdrop tap (unless `dismissible` is
 * false, e.g. mid-upload), and via the always-present close button. Focus is
 * moved in on open, trapped while open, and restored on close.
 */
export default function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  size?: "md" | "lg";
  dismissible?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Read through a ref so a parent re-render (every keystroke in a form
  // inside the sheet) can't re-run the focus effect below. When onClose was
  // a dependency, each character tore the effect down — restoring focus to
  // the trigger — and set it up again, which closed the phone keyboard.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Runs once per open/close, never on re-render.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const token = Symbol("sheet");
    stack.push(token);

    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      const i = stack.indexOf(token);
      if (i !== -1) stack.splice(i, 1);
      // Only the last sheet standing releases the page scroll lock.
      if (stack.length === 0) document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // Keyboard handling is separate: it can re-bind freely without touching
  // focus, and it reaches onClose through the ref.
  useEffect(() => {
    if (!open) return;
    const token = stack[stack.length - 1];

    function onKey(e: KeyboardEvent) {
      // Only the topmost sheet reacts, so Escape peels one layer at a time.
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      const panel = panelRef.current;
      if (e.key !== "Tab" || !panel) return;
      const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (n) => n.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  // Rendered into <body>. An ancestor with backdrop-filter (the sticky app
  // header) would otherwise become the containing block for `position: fixed`
  // and squash the sheet into the header's own 56px box.
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "bg-white w-full flex flex-col overflow-hidden animate-sheet-up",
          "rounded-t-sheet sm:rounded-sheet shadow-lift",
          "max-h-[92dvh] sm:max-h-[88dvh]",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md",
        ].join(" ")}
      >
        <div className="relative flex items-start gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-ink/[0.06]">
          {/* Grab handle reads as "draggable sheet" on touch; purely visual. */}
          <div className="sm:hidden absolute left-1/2 -translate-x-1/2 top-2 w-9 h-1 rounded-full bg-ink/15" />
          <div className="flex-1 min-w-0 pt-1 sm:pt-0">
            <h2 className="font-semibold text-[17px] leading-tight truncate">{title}</h2>
            {description && <p className="text-sm text-ink/65 mt-0.5">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <Close className="w-5 h-5" />
          </IconButton>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 flex-1">{children}</div>

        {footer && (
          <div className="px-4 sm:px-5 py-3 border-t border-ink/[0.06] bg-white pb-safe">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
