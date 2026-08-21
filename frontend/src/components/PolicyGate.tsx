import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Button from "./ui/Button";
import { useSignOut } from "./ProfileMenu";
import { SUPPORT_EMAIL } from "../pages/Legal";

export type PolicyStatus = { version: string; accepted: boolean; acceptedAt: string | null };

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; status: PolicyStatus };

/**
 * Blocks the app until the signed-in user has accepted the current Terms and
 * Privacy Policy.
 *
 * Deliberate choices:
 *  - The checkbox starts UNTICKED. A pre-ticked box is not consent.
 *  - No dismissal: no backdrop click, no Escape, no close icon. The only ways
 *    past are accepting or signing out.
 *  - Browser Back is neutralised while it is up, so history navigation cannot
 *    slip behind it.
 *  - It fails CLOSED. If the status check errors we show a retry, never the
 *    app — otherwise a flaky network would silently grant unconsented access.
 *  - Versioned, so this appears once per user until the version is bumped.
 */
export default function PolicyGate() {
  const { user } = useAuth();
  const signOut = useSignOut();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(() => {
    setLoad({ state: "loading" });
    api
      .get<PolicyStatus>("/policy/status")
      .then((status) => setLoad({ state: "ready", status }))
      .catch(() => setLoad({ state: "error" }));
  }, []);

  useEffect(() => {
    if (!user) {
      loadedFor.current = null;
      setLoad({ state: "loading" });
      setChecked(false);
      return;
    }
    if (loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    fetchStatus();
  }, [user, fetchStatus]);

  // Signed out: the landing page is public, so nothing to gate.
  const blocking =
    Boolean(user) && (load.state !== "ready" || !load.status.accepted);

  // Scroll lock, focus, and a Back-button trap while blocking.
  useEffect(() => {
    if (!blocking) return;
    panelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Push a state and re-push on popstate: Back becomes a no-op rather than
    // a way to reach the app with consent outstanding.
    window.history.pushState(null, "", window.location.href);
    const onPop = () => window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPop);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("popstate", onPop);
    };
  }, [blocking]);

  const accept = useCallback(async () => {
    if (!checked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await api.post<PolicyStatus>("/policy/accept");
      setLoad({ state: "ready", status });
    } catch (err: any) {
      setError(err?.message ?? "We couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [checked, busy]);

  if (!blocking) return null;

  const shell = (children: React.ReactNode, labelledBy: string) =>
    createPortal(
      <div className="fixed inset-0 z-[95] grid place-items-center p-4 bg-ink/55 backdrop-blur-[2px] animate-fade-in">
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className="w-full max-w-md rounded-sheet bg-white shadow-lift border border-ink/10 p-5 sm:p-6 animate-sheet-up outline-none max-h-[92dvh] overflow-y-auto"
        >
          {children}
        </div>
      </div>,
      document.body,
    );

  // Still checking — a plain waiting state, never the app underneath.
  if (load.state === "loading") {
    return shell(
      <div aria-busy="true">
        <h2 id="policy-loading-title" className="text-[18px] font-bold tracking-tight">
          Just a moment
        </h2>
        <p className="text-[14.5px] text-ink/70 leading-relaxed mt-2">
          Checking your account details…
        </p>
        <div className="mt-4 space-y-2" aria-hidden>
          <div className="h-3 rounded shimmer bg-ink/[0.06]" />
          <div className="h-3 w-2/3 rounded shimmer bg-ink/[0.06]" />
        </div>
      </div>,
      "policy-loading-title",
    );
  }

  // Failed to check — retry, never a silent pass.
  if (load.state === "error") {
    return shell(
      <div>
        <h2 id="policy-error-title" className="text-[18px] font-bold tracking-tight">
          We couldn't check your account
        </h2>
        <p className="text-[14.5px] text-ink/70 leading-relaxed mt-2">
          This is usually a connection problem. Try again in a moment.
        </p>
        <div className="space-y-2 mt-4">
          <Button block size="lg" onClick={fetchStatus}>
            Try again
          </Button>
          <Button block variant="quiet" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>,
      "policy-error-title",
    );
  }

  return shell(
    <>
      <h2 id="policy-gate-title" className="text-[20px] font-bold tracking-tight">
        Review and accept
      </h2>
      <p className="text-[14.5px] text-ink/70 leading-relaxed mt-2">
        To keep using TryUnex, please confirm you accept our Terms of Service and Privacy Policy.
        We'll only ask again if they change materially.
      </p>

      <div className="mt-4 rounded-xl bg-lilac/45 border border-brand-200/60 p-3.5">
        <label htmlFor="policy-consent" className="flex gap-3 items-start cursor-pointer">
          <input
            id="policy-consent"
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            aria-describedby={error ? "policy-error" : undefined}
            className="mt-0.5 w-5 h-5 shrink-0 rounded border-ink/25 text-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          />
          <span className="text-[14px] leading-relaxed">
            I have read and agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 underline underline-offset-2"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 underline underline-offset-2"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
      </div>

      {error && (
        <div
          id="policy-error"
          role="alert"
          className="mt-3 rounded-xl bg-coral/10 border border-coral/25 px-3.5 py-2.5"
        >
          <p className="text-[13.5px] leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={accept}
            className="mt-1.5 text-[13px] font-semibold text-coral underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      <div className="space-y-2 mt-4">
        <Button block size="lg" disabled={!checked} loading={busy} onClick={accept}>
          Agree and continue
        </Button>
        <Button block variant="quiet" onClick={signOut} disabled={busy}>
          Not now — sign out
        </Button>
      </div>

      <p className="text-[12px] text-ink/55 leading-relaxed mt-3 text-center">
        Questions? Contact our Grievance Officer at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-brand-700">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </>,
    "policy-gate-title",
  );
}
