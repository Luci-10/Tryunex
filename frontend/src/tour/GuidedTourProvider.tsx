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
import Sheet from "../components/ui/Sheet";
import Button from "../components/ui/Button";
import TourSpotlight from "./TourSpotlight";
import TourTooltip, { TourComplete } from "./TourTooltip";
import { TOUR_STEPS, type TourSignal } from "./steps";

type Status = "not_started" | "offered" | "active" | "completed" | "skipped";

type TourApi = {
  active: boolean;
  /** Called by real app handlers when the user does the thing. */
  signal: (s: TourSignal) => void;
  /** Opens the permission prompt again, e.g. from Settings. */
  replay: () => void;
};

const Ctx = createContext<TourApi | null>(null);

/** Routes where interrupting would be rude or unsafe. */
const NEVER_INTERRUPT = ["/login", "/register", "/plans"];

export function GuidedTourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();

  const [status, setStatus] = useState<Status>("not_started");
  const [stepIndex, setStepIndex] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  // Nothing is offered until the server has told us what this user's state
  // is. Without this the default "not_started" would prompt everyone for a
  // moment on load — and overwrite an existing user's skipped state.
  const [loaded, setLoaded] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const step = TOUR_STEPS[stepIndex];
  const active = status === "active";

  // ---- server state ---------------------------------------------------
  useEffect(() => {
    if (!user || loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    api
      .get<{ onboarding: { status: Status; currentStep: string | null } }>("/onboarding")
      .then((r) => {
        setStatus(r.onboarding.status);
        const i = TOUR_STEPS.findIndex((s) => s.id === r.onboarding.currentStep);
        if (i >= 0) setStepIndex(i);
        setLoaded(true);
      })
      .catch(() => {
        // The tour is optional — never block the app, and never guess that
        // someone is new when we couldn't find out.
      });
  }, [user]);

  const persist = useCallback((patch: Record<string, unknown>) => {
    api.patch("/onboarding", patch).catch(() => {});
  }, []);

  // Offer once, only on the wardrobe, and only to a genuinely new account.
  useEffect(() => {
    if (!loaded || !user || pathname !== "/" || askOpen) return;
    if (status !== "not_started") return;
    setAskOpen(true);
    setStatus("offered");
    persist({ status: "offered" });
  }, [loaded, user, pathname, status, askOpen, persist]);

  // ---- target tracking ------------------------------------------------
  useEffect(() => {
    if (!active || !step) return;
    // The step may live on another page; wait quietly rather than nagging.
    if (step.onRoute && pathname !== step.onRoute) {
      setRect(null);
      return;
    }
    let raf = 0;
    let scrolled = false;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour-id="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        // A fixed control (the FAB, the tab bar) is already on screen —
        // scrolling to it just moves the page under the highlight. Only
        // scroll when the target is genuinely out of view.
        const fixed = getComputedStyle(el).position === "fixed";
        const offscreen = r.top < 0 || r.bottom > window.innerHeight;
        if (!scrolled && !fixed && offscreen) {
          scrolled = true;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setRect(r);
      } else {
        setRect(null);
      }
      raf = requestAnimationFrame(find);
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [active, step, pathname]);

  // Reaching /tryon completes the "open the studio" step on its own.
  useEffect(() => {
    if (!active || !step) return;
    if (step.signal === "tryon:studio-open" && pathname === "/tryon") advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, active, step]);

  // ---- flow -----------------------------------------------------------
  // The current index is read from a ref rather than inside a setState
  // updater: React runs those twice in development, which would fire the
  // save request twice for every step.
  const stepRef = useRef(stepIndex);
  stepRef.current = stepIndex;

  const advance = useCallback(() => {
    const i = stepRef.current;
    const next = i + 1;
    if (next >= TOUR_STEPS.length) {
      setStatus("completed");
      setShowComplete(true);
      persist({ status: "completed", currentStep: null });
      return;
    }
    stepRef.current = next;
    setStepIndex(next);
    persist({
      currentStep: TOUR_STEPS[next].id,
      ...(TOUR_STEPS[i].hint ? { hint: TOUR_STEPS[i].hint } : {}),
    });
  }, [persist]);

  const signal = useCallback(
    (s: TourSignal) => {
      if (status !== "active") return;
      if (TOUR_STEPS[stepIndex]?.signal === s) advance();
    },
    [status, stepIndex, advance],
  );

  // Chat lives outside the tour's import graph, so it announces itself on a
  // window event; the ref keeps this listener bound once.
  const signalRef = useRef(signal);
  signalRef.current = signal;

  useEffect(() => {
    const onChat = () => signalRef.current("chat:opened");
    window.addEventListener("tryunex:chat-opened", onChat);
    return () => window.removeEventListener("tryunex:chat-opened", onChat);
  }, []);

  const start = useCallback(() => {
    setAskOpen(false);
    stepRef.current = 0;
    setStepIndex(0);
    setStatus("active");
    persist({ status: "active", currentStep: TOUR_STEPS[0].id });
    if (pathname !== "/") nav("/");
  }, [persist, nav, pathname]);

  const skip = useCallback(() => {
    setAskOpen(false);
    setStatus("skipped");
    persist({ status: "skipped" });
  }, [persist]);

  const replay = useCallback(() => setAskOpen(true), []);

  // Escape leaves the tour rather than trapping anyone in it.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, skip]);

  const value = useMemo<TourApi>(() => ({ active, signal, replay }), [active, signal, replay]);

  const overlayVisible =
    active && step && !NEVER_INTERRUPT.includes(pathname) && (!step.onRoute || step.onRoute === pathname);

  return (
    <Ctx.Provider value={value}>
      {children}

      <Sheet
        open={askOpen}
        onClose={skip}
        title="Want a quick tour?"
        footer={
          <div className="space-y-2">
            <Button block size="lg" onClick={start}>
              Show me how
            </Button>
            <Button block variant="secondary" onClick={skip}>
              I'll explore myself
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink/75 leading-relaxed">
          I can show you how to add clothes, build a Try-on look, plan outfits, and ask your AI
          stylist.
        </p>
        <p className="text-[12.5px] text-ink/60 leading-relaxed mt-2">
          It follows what you actually do — nothing is bought, uploaded or sent on your behalf, and
          you can stop any time.
        </p>
      </Sheet>

      {overlayVisible &&
        createPortal(
          <>
            <TourSpotlight rect={rect} />
            <TourTooltip
              step={step}
              rect={rect}
              index={stepIndex}
              total={TOUR_STEPS.length}
              onSkip={skip}
              onClose={skip}
            />
          </>,
          document.body,
        )}

      {showComplete &&
        createPortal(
          <TourComplete
            onWardrobe={() => {
              setShowComplete(false);
              nav("/");
            }}
            onDone={() => setShowComplete(false)}
          />,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function useGuidedTour(): TourApi {
  // Safe to call anywhere: components outside the provider get a no-op.
  return useContext(Ctx) ?? { active: false, signal: () => {}, replay: () => {} };
}
