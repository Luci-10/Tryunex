import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Sheet from "./Sheet";
import Button from "./Button";

type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` styles the primary action as destructive. */
  tone?: "danger" | "default";
};

const Ctx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Replaces window.confirm() everywhere. `const ok = await confirm({...})`
 * reads like the native call but renders in-app, is keyboard-operable, and
 * matches the rest of the visual system.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Sheet
        open={opts !== null}
        onClose={() => settle(false)}
        title={opts?.title ?? ""}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => settle(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={opts?.tone === "danger" ? "destructive" : "primary"}
              block
              onClick={() => settle(true)}
            >
              {opts?.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink/70 leading-relaxed">{opts?.body}</p>
      </Sheet>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ConfirmProvider missing");
  return v;
}
