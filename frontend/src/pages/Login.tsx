import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import { useAuth } from "../auth";
import AuthShell from "../components/AuthShell";
import Button from "../components/ui/Button";
import { Input, Label, FieldError } from "../components/ui/Field";
import { ChevronLeft, Mail } from "../components/ui/icons";

const RESEND_SECONDS = 30;

export default function Login() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  // Resend is rate-limited client-side so the button can't be mashed while
  // the first mail is still in flight.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  async function requestOtp(resend = false) {
    setError(null);
    if (!email) return;
    setBusy(true);
    try {
      await api.post("/auth/start", { email });
      setStep("otp");
      setCooldown(RESEND_SECONDS);
      setInfo(resend ? `New code sent to ${email}.` : `Code sent to ${email}. Check spam too.`);
    } catch (err: any) {
      setError(err.message ?? "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<
        { status: "logged_in"; user: User } | { status: "needs_registration"; email: string }
      >("/auth/verify", { email, otp });
      if (r.status === "logged_in") {
        setUser(r.user);
        nav("/", { replace: true });
      } else {
        nav("/register", { replace: true });
      }
    } catch (err: any) {
      setError(err.message ?? "Verification failed");
      setBusy(false);
    }
  }

  function backToEmail() {
    setStep("email");
    setOtp("");
    setError(null);
    setInfo(null);
  }

  return (
    <AuthShell
      title={step === "email" ? "Welcome back" : "Check your email"}
      subtitle={
        step === "email"
          ? "Enter your email and we'll send a 6-digit code — no password to remember."
          : undefined
      }
      footer="Your wardrobe, your photos, your call on who sees them."
    >
      {step === "email" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            requestOtp();
          }}
          className="space-y-4"
        >
          <label className="block">
            <Label>Email address</Label>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-invalid={error ? true : undefined}
            />
            <FieldError>{error}</FieldError>
          </label>
          <Button type="submit" size="lg" block loading={busy} leading={<Mail className="w-4 h-4" />}>
            {busy ? "Sending code…" : "Send me a code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <div className="flex items-center gap-1.5 text-sm text-ink/70">
            <button
              type="button"
              onClick={backToEmail}
              className="tap-44 inline-flex items-center gap-0.5 text-brand-700 font-medium hover:underline"
            >
              <ChevronLeft className="w-4 h-4" />
              Change
            </button>
            <span className="truncate">{email}</span>
          </div>

          <label className="block">
            <Label>6-digit code</Label>
            <Input
              ref={otpRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="······"
              aria-invalid={error ? true : undefined}
              className="h-14 text-center text-2xl font-mono tracking-[0.45em] placeholder:tracking-[0.45em]"
            />
            <FieldError>{error}</FieldError>
          </label>

          <Button type="submit" size="lg" block loading={busy} disabled={otp.length !== 6}>
            {busy ? "Verifying…" : "Verify and continue"}
          </Button>

          <Button
            type="button"
            variant="quiet"
            block
            disabled={busy || cooldown > 0}
            onClick={() => requestOtp(true)}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>
        </form>
      )}

      {/* Status updates are announced without stealing focus from the input. */}
      <p aria-live="polite" className="sr-only">
        {error ?? info ?? ""}
      </p>
      {info && !error && <p className="mt-3 text-[13px] text-emerald-700">{info}</p>}
    </AuthShell>
  );
}
