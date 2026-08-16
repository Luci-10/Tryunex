import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Button from "./ui/Button";
import { useSignOut } from "./ProfileMenu";

type Status = { version: string; accepted: boolean; acceptedAt: string | null };

/**
 * Asks a signed-in user to accept the Terms and Privacy Policy once.
 *
 * Deliberate choices:
 *  - The checkbox starts UNTICKED. A pre-ticked box is not consent.
 *  - There is no backdrop-click or Escape dismissal. This is a consent gate,
 *    not a notice; the way out without agreeing is to sign out.
 *  - Acceptance is recorded per policy version, so this appears exactly once
 *    per user until the version is bumped.
 *  - If the status check fails, nothing is shown. A network blip must not
 *    lock anyone out of their wardrobe.
 */
export default function PolicyGate() {
  const { user } = useAuth();
  const signOut = useSignOut();
  const [status, setStatus] = useState<Status | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedFor = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      checkedFor.current = null;
      setStatus(null);
      setChecked(false);
      return;
    }
    if (checkedFor.current === user.id) return;
    checkedFor.current = user.id;
    api
      .get<Status>("/policy/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [user]);

  const open = Boolean(user && status && !status.accepted);

  // Hold focus inside the panel while it is up.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const accept = useCallback(async () => {
    if (!checked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Status>("/policy/accept");
      setStatus(r);
    } catch (err: any) {
      setError(err?.message ?? "Could not save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [checked, busy]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center p-4 bg-ink/55 backdrop-blur-[2px] animate-fade-in">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-gate-title"
        className="w-full max-w-md rounded-sheet bg-white shadow-lift border border-ink/10 p-5 sm:p-6 animate-sheet-up outline-none max-h-[92dvh] overflow-y-auto"
      >
        <h2 id="policy-gate-title" className="text-[20px] font-bold tracking-tight">
          A quick agreement
        </h2>
        <p className="text-[14.5px] text-ink/70 leading-relaxed mt-2">
          Before you carry on, please confirm you accept how TryUnex works and how your data is
          handled. This takes one tap and we'll only ask again if the policies change materially.
        </p>

        <div className="mt-4 rounded-xl bg-ink/[0.035] border border-ink/[0.06] p-3.5">
          <label className="flex gap-3 items-start cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-5 h-5 shrink-0 rounded border-ink/25 text-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500"
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
              and the{" "}
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

        {error && <p className="text-[13px] text-coral mt-2.5">{error}</p>}

        <div className="space-y-2 mt-4">
          <Button block size="lg" disabled={!checked} loading={busy} onClick={accept}>
            Agree and continue
          </Button>
          <Button block variant="quiet" onClick={signOut} disabled={busy}>
            Not now — sign out
          </Button>
        </div>

        <p className="text-[12px] text-ink/55 leading-relaxed mt-3 text-center">
          Questions? Write to{" "}
          <a href="mailto:tryunex8@gmail.com" className="font-semibold text-brand-700">
            tryunex8@gmail.com
          </a>
          .
        </p>
      </div>
    </div>,
    document.body,
  );
}
