import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Tone = "default" | "success" | "error";

export type ToastOptions = {
  tone?: Tone;
  /** Optional single undo-style action rendered inline in the snackbar. */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};

type Item = ToastOptions & { id: number; message: string };

type Api = {
  toast: (message: string, opts?: ToastOptions) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<Api | null>(null);

const TONES: Record<Tone, string> = {
  default: "bg-ink text-white",
  success: "bg-ink text-white",
  error: "bg-coral text-white",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((p) => p.filter((i) => i.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = ++seq.current;
      // An action needs longer to be noticed and clicked than a bare receipt.
      const duration = opts.durationMs ?? (opts.action ? 6000 : 2600);
      setItems((p) => [...p.slice(-2), { ...opts, id, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  return (
    <Ctx.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {items.map((i) => (
          <div
            key={i.id}
            className={`pointer-events-auto flex items-center gap-3 max-w-[min(92vw,26rem)] pl-4 pr-2 py-2.5 rounded-full shadow-lift animate-sheet-up ${TONES[i.tone ?? "default"]}`}
          >
            <span className="text-sm leading-snug">{i.message}</span>
            {i.action && (
              <button
                type="button"
                onClick={() => {
                  i.action!.onClick();
                  dismiss(i.id);
                }}
                className="tap-44 text-sm font-semibold underline underline-offset-2 px-2 py-1 shrink-0"
              >
                {i.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ToastProvider missing");
  return v;
}
