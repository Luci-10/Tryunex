import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import { ChevronLeft, ChevronRight, Close } from "../components/ui/icons";
import { SLIDES } from "./slides";

type Status = "not_started" | "offered" | "active" | "completed" | "skipped";

type Api = {
  /** Reopens the permission prompt, e.g. from Settings. */
  replay: () => void;
};

const Ctx = createContext<Api | null>(null);

/** Wardrobe listens for this so the last slide can open the real Add sheet. */
export const OPEN_ADD_CLOTH_EVENT = "tryunex:open-add-cloth";

/**
 * A plain modal slideshow. It deliberately owns the screen while open rather
 * than trying to point at controls underneath: the previous spotlight version
 * had to keep a highlight aligned with live layout and let clicks through a
 * dimmer, and neither held up.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();

  const [status, setStatus] = useState<Status>("not_started");
  const [slide, setSlide] = useState(0);
  const [asking, setAsking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = status === "active";
  const last = slide === SLIDES.length - 1;
  const current = SLIDES[slide];

  // ---- server state ---------------------------------------------------
  useEffect(() => {
    if (!user || loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    api
      .get<{ onboarding: { status: Status; currentSlide: number | null } }>("/onboarding")
      .then((r) => {
        setStatus(r.onboarding.status);
        // Resume only a tour that was genuinely left running.
        if (r.onboarding.status === "active" && typeof r.onboarding.currentSlide === "number") {
          setSlide(Math.min(Math.max(0, r.onboarding.currentSlide), SLIDES.length - 1));
        }
        setLoaded(true);
      })
      .catch(() => {
        // Onboarding is optional. If we can't read the state we assume
        // nothing — better silent than prompting someone twice.
      });
  }, [user]);

  const persist = useCallback((patch: Record<string, unknown>) => {
    api.patch("/onboarding", patch).catch(() => {});
  }, []);

  // Offer once, on the wardrobe, and only after the real state has loaded.
  useEffect(() => {
    if (!loaded || !user || pathname !== "/" || asking || open) return;
    if (status !== "not_started") return;
    setAsking(true);
    setStatus("offered");
    persist({ status: "offered" });
  }, [loaded, user, pathname, status, asking, open, persist]);

  // ---- flow -----------------------------------------------------------
  const start = useCallback(() => {
    setAsking(false);
    setSlide(0);
    setStatus("active");
    persist({ status: "active", currentSlide: 0 });
  }, [persist]);

  const skip = useCallback(() => {
    setAsking(false);
    setStatus("skipped");
    persist({ status: "skipped" });
  }, [persist]);

  const finish = useCallback(
    (then?: "wardrobe" | "add") => {
      setStatus("completed");
      persist({ status: "completed", currentSlide: null });
      if (then === "wardrobe" && pathname !== "/") nav("/");
      if (then === "add") {
        if (pathname !== "/") nav("/");
        // Let the wardrobe mount before asking it to open the real sheet.
        setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_ADD_CLOTH_EVENT)), 120);
      }
    },
    [persist, nav, pathname],
  );

  const go = useCallback(
    (next: number) => {
      const n = Math.min(Math.max(0, next), SLIDES.length - 1);
      setSlide(n);
      persist({ currentSlide: n });
    },
    [persist],
  );

  const replay = useCallback(() => {
    // Resets the slideshow only. Wardrobe, credits, plans and subscriptions
    // are untouched — this endpoint can't reach them.
    setSlide(0);
    setAsking(true);
  }, []);

  // Escape exits deliberately rather than trapping anyone.
  useEffect(() => {
    if (!open && !asking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (asking) skip();
      else skip();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, asking, skip]);

  // Body scroll stays locked while either dialog is up.
  useEffect(() => {
    if (!open && !asking) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, asking]);

  // Move focus into the panel each time the slide changes, so screen readers
  // announce the new content and keyboard users stay in context.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open, slide]);

  const value = useMemo<Api>(() => ({ replay }), [replay]);

  return (
    <Ctx.Provider value={value}>
      {children}

      {asking &&
        createPortal(
          <div className="fixed inset-0 z-[90] grid place-items-center p-4 bg-ink/45 backdrop-blur-[2px] animate-fade-in">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-ask-title"
              className="w-full max-w-sm rounded-sheet bg-white shadow-lift border border-ink/10 p-5 animate-sheet-up"
            >
              <h2 id="tour-ask-title" className="text-[19px] font-bold tracking-tight">
                Want a quick tour?
              </h2>
              <p className="text-sm text-ink/70 leading-relaxed mt-1.5">
                See how TryUnex helps you organise clothes, try outfits on, plan looks, and ask your
                AI stylist.
              </p>
              <div className="space-y-2 mt-4">
                <Button block size="lg" onClick={start}>
                  Show me how
                </Button>
                <Button block variant="secondary" onClick={skip}>
                  I'll explore myself
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {open &&
        createPortal(
          // Backdrop click is deliberately inert — losing your place because
          // of a stray tap would be worse than one extra tap to close.
          <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-ink/50 backdrop-blur-[2px] animate-fade-in">
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-slide-title"
              className="w-full sm:max-w-md bg-white rounded-t-sheet sm:rounded-sheet shadow-lift border border-ink/10 overflow-hidden animate-sheet-up max-h-[92dvh] flex flex-col outline-none"
            >
              <div className="flex items-center gap-2 px-4 pt-3.5">
                <p className="text-[12px] font-semibold text-ink/55">
                  {slide + 1} of {SLIDES.length}
                </p>
                <div className="flex gap-1 ml-1" aria-hidden>
                  {SLIDES.map((s, i) => (
                    <span
                      key={s.id}
                      className={`h-1.5 rounded-full transition-all ${
                        i === slide ? "w-4 bg-brand-500" : i < slide ? "w-1.5 bg-brand-300" : "w-1.5 bg-ink/15"
                      }`}
                    />
                  ))}
                </div>
                <IconButton label="Close the tour" className="ml-auto" onClick={skip}>
                  <Close className="w-5 h-5" />
                </IconButton>
              </div>

              <div className="px-4 pb-2 pt-3 overflow-y-auto">
                {current.art}
                <h2 id="tour-slide-title" className="text-[19px] font-bold tracking-tight mt-4">
                  {current.title}
                </h2>
                <p className="text-sm text-ink/70 leading-relaxed mt-1.5">{current.text}</p>
                {current.note && (
                  <p className="text-[12px] text-ink/60 leading-relaxed mt-2">{current.note}</p>
                )}
              </div>

              <div className="px-4 py-3 border-t border-ink/[0.07] pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
                {last ? (
                  <div className="space-y-2">
                    <Button block size="lg" onClick={() => finish("wardrobe")}>
                      Go to my wardrobe
                    </Button>
                    <Button block variant="secondary" onClick={() => finish("add")}>
                      Add my first piece
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {slide > 0 && (
                      <Button
                        variant="secondary"
                        onClick={() => go(slide - 1)}
                        leading={<ChevronLeft className="w-4 h-4" />}
                      >
                        Back
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={skip}
                      className="tap-44 text-[13px] text-ink/60 hover:text-ink underline underline-offset-2 px-1"
                    >
                      Skip
                    </button>
                    <Button
                      className="ml-auto flex-row-reverse"
                      onClick={() => go(slide + 1)}
                      leading={<ChevronRight className="w-4 h-4" />}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function useOnboarding(): Api {
  return useContext(Ctx) ?? { replay: () => {} };
}
