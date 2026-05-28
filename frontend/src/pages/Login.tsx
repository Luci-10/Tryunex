import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import { useAuth } from "../auth";

export default function Login() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    if (!email) return;
    setBusy(true);
    try {
      await api.post("/auth/start", { email });
      setStep("otp");
      setInfo(`Code sent to ${email}. Check your inbox (and spam).`);
    } catch (err: any) {
      setError(err.message ?? "Could not send code");
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
        | { status: "logged_in"; user: User }
        | { status: "needs_registration"; email: string }
      >("/auth/verify", { email, otp });
      if (r.status === "logged_in") {
        setUser(r.user);
        nav("/", { replace: true });
      } else {
        nav("/register", { replace: true });
      }
    } catch (err: any) {
      setError(err.message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">Tryunex</h1>
          <p className="text-sm text-gray-600">Sign in with your email — we'll send you a 6-digit code.</p>
        </div>

        {step === "email" && (
          <form onSubmit={requestOtp} className="space-y-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border rounded-lg px-3 py-2"
            />
            <button
              disabled={busy}
              className="w-full bg-brand-600 text-white rounded-lg py-2 font-medium disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verify} className="space-y-3">
            <div className="text-sm text-gray-600">
              Code sent to <strong>{email}</strong>{" "}
              <button
                type="button"
                onClick={() => { setStep("email"); setOtp(""); setError(null); setInfo(null); }}
                className="text-brand-700 hover:underline"
              >
                change
              </button>
            </div>
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              className="w-full border rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-[0.5em]"
            />
            <button
              disabled={busy || otp.length !== 6}
              className="w-full bg-brand-600 text-white rounded-lg py-2 font-medium disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => requestOtp()}
              className="w-full text-sm text-brand-700 hover:underline"
            >
              Resend code
            </button>
          </form>
        )}

        {info && <p className="text-sm text-emerald-700">{info}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
