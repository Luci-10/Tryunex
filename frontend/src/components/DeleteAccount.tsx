import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet from "./ui/Sheet";
import Button, { Spinner } from "./ui/Button";
import OtpInput from "./ui/OtpInput";
import { api } from "../api";
import { useAuth } from "../auth";

type Preview = {
  clothes: number;
  tryonImages: number;
  activeListings: number;
  conversations: number;
  creditBalance: number;
  payments: number;
};

/**
 * Permanent account deletion.
 *
 * Two steps on purpose. The first spells out what is about to be destroyed
 * using the real counts, because "delete account" is abstract and "47 garments
 * and 12 try-on photos" is not. The second requires a code sent to the
 * registered address, so leaving a session open on a shared device is not
 * enough for someone else to finish the job.
 */
export default function DeleteAccount() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"review" | "code">("review");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setOpen(true);
    setStep("review");
    setOtp("");
    setError("");
    setPreview(null);
    try {
      setPreview(await api.get<Preview>("/account/deletion-preview"));
    } catch {
      // The summary is a courtesy; failing to load it should not trap someone
      // who has decided to leave.
      setPreview(null);
    }
  }

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const r = await api.post<{ email: string }>("/account/delete/start");
      setSentTo(r.email);
      setStep("code");
    } catch (e: any) {
      setError(e?.message ?? "Could not send the confirmation email.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(code: string) {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/account/delete/confirm", { otp: code });
      // The account is gone; drop local auth state before navigating so no
      // protected route briefly renders against a dead session.
      setUser(null);
      nav("/", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Could not delete the account.");
      setOtp("");
      setBusy(false);
    }
  }

  const counts = preview
    ? [
        ["Garments", preview.clothes],
        ["Try-on photos", preview.tryonImages],
        ["Thrift listings", preview.activeListings],
        ["Conversations", preview.conversations],
      ].filter(([, n]) => (n as number) > 0)
    : [];

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="w-full flex items-center gap-3 px-4 min-h-[52px] py-2.5 text-left hover:bg-red-50 active:bg-red-100 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium leading-tight text-red-700">
            Delete my account
          </span>
          <span className="block text-[12px] text-ink/60 mt-0.5">
            Permanently removes your wardrobe, photos and account. This cannot be undone.
          </span>
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={step === "review" ? "Delete your account?" : "Confirm deletion"}
        description={
          step === "review"
            ? "This is permanent. There is no way to undo it or recover anything afterwards."
            : `Enter the 6-digit code sent to ${sentTo}.`
        }
        dismissible={!busy}
        footer={
          step === "review" ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                Keep my account
              </Button>
              <Button variant="destructive" onClick={sendCode} disabled={busy}>
                {busy ? <Spinner /> : "Continue"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep("review")} disabled={busy}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={() => confirm(otp)}
                disabled={busy || otp.length !== 6}
              >
                {busy ? <Spinner /> : "Delete permanently"}
              </Button>
            </div>
          )
        }
      >
        {step === "review" ? (
          <div className="space-y-3">
            {counts.length > 0 && (
              <div className="rounded-xl bg-red-50 border border-red-100 p-3">
                <p className="text-[12px] font-semibold text-red-800 uppercase tracking-wide">
                  Will be deleted
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {counts.map(([label, n]) => (
                    <div key={label as string} className="flex items-baseline justify-between gap-2">
                      <dt className="text-[13px] text-ink/70">{label}</dt>
                      <dd className="text-[14px] font-semibold text-red-800">{n as number}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {preview && preview.creditBalance > 0 && (
              <p className="text-[13px] text-ink/75 leading-relaxed">
                You still have{" "}
                <strong>
                  {preview.creditBalance} credit{preview.creditBalance === 1 ? "" : "s"}
                </strong>
                . Credits are not refundable and will be lost.
              </p>
            )}

            {preview && preview.activeListings > 0 && (
              <p className="text-[13px] text-ink/75 leading-relaxed">
                Your {preview.activeListings === 1 ? "listing" : "listings"} on Thrift will be
                removed and buyers will no longer be able to reach you.
              </p>
            )}

            <p className="text-[13px] text-ink/75 leading-relaxed">
              Photos of clothes you have already sold stay with the buyer, since they own those
              items now. We keep a record of any payments you made, without your name or email
              attached, because accounting rules require it.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <OtpInput
              value={otp}
              onChange={(v) => {
                setOtp(v);
                setError("");
              }}
              onComplete={confirm}
              disabled={busy}
              invalid={Boolean(error)}
              autoFocus
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="tap-44 text-[13px] font-semibold text-brand-700 underline underline-offset-2 disabled:opacity-50"
            >
              Send a new code
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}
      </Sheet>
    </>
  );
}
