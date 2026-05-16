import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import * as api from "../lib/api";
import { completeOnboarding } from "../lib/api";

export default function Auth() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email"); // email | otp | onboarding
  const [email, setEmail] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendSecs, setResendSecs] = useState(0);
  const timerRef = useRef(null);

  function startCountdown() {
    setResendSecs(30);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendSecs((s) => {
        if (s <= 1) { clearInterval(timerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api.sendOtp(email);
      if (!data.ok) { setError(data.error || "Failed to send code."); return; }
      setOtpToken(data.token);
      setStep("otp");
      startCountdown();
    } catch {
      setError("Cannot reach server. Make sure the backend is running on port 3001.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    const otp = e.target.otp.value.trim();
    if (otp.length !== 6) { setError("Enter the 6-digit code."); return; }
    setLoading(true);
    setError("");
    try {
      const data = await api.verifyOtp(email, otp, otpToken);
      if (!data.ok) { setError(data.error || "Invalid code. Try again."); return; }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInErr) { setError(signInErr.message); return; }

      if (data.isNewUser) {
        // New user — collect profile details before going to dashboard
        setStep("onboarding");
      } else {
        // Existing user — go straight to dashboard
        navigate("/", { replace: true });
      }
    } catch {
      setError("Cannot reach server. Make sure the backend is running on port 3001.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError("");
    try {
      const data = await api.sendOtp(email);
      if (!data.ok) { setError(data.error || "Failed to resend code."); return; }
      setOtpToken(data.token);
      startCountdown();
    } catch {
      setError("Cannot reach server. Make sure the backend is running on port 3001.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOnboarding(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Session expired. Please sign in again.");
        setStep("email");
        return;
      }

      const data = await completeOnboarding(session.access_token, {
        name:   e.target.fullName.value.trim(),
        dob:    e.target.dob.value,
        gender: e.target.gender.value,
        phone:  e.target.phone.value.trim(),
      });

      if (!data.ok) { setError(data.error || "Something went wrong. Try again."); return; }

      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Cannot reach server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">T</div>
          <div className="brand-text">
            <strong>Tryunex</strong>
            <small>shared wardrobe planner</small>
          </div>
        </div>

        {/* Step 1 — Email */}
        {step === "email" && (
          <form className="auth-form" onSubmit={handleSendOtp}>
            <h2>Sign in to your wardrobe</h2>
            <p className="auth-sub">Enter your email — we'll send a one-time code.</p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                autoComplete="email"
              />
            </label>
            <button className="btn-primary" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </button>
          </form>
        )}

        {/* Step 2 — OTP */}
        {step === "otp" && (
          <form className="auth-form" onSubmit={handleVerifyOtp}>
            <h2>Check your inbox</h2>
            <p className="auth-sub">
              We sent a 6-digit code to <strong>{email}</strong>.<br />
              Expires in 15 minutes.
            </p>
            <label className="field">
              <span>6-digit code</span>
              <input
                name="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                required
                autoFocus
                autoComplete="one-time-code"
              />
            </label>
            <button className="btn-primary" disabled={loading}>
              {loading ? "Verifying…" : "Verify code"}
            </button>
            <div className="auth-secondary-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={handleResend}
                disabled={resendSecs > 0 || loading}
              >
                {resendSecs > 0 ? `Resend in ${resendSecs}s` : "Resend code"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setStep("email"); setError(""); }}
              >
                Change email
              </button>
            </div>
          </form>
        )}

        {/* Step 3 — Onboarding (new users only) */}
        {step === "onboarding" && (
          <form className="auth-form" onSubmit={handleOnboarding}>
            <h2>Almost there!</h2>
            <p className="auth-sub">Fill in a few details to set up your wardrobe.</p>

            <label className="field">
              <span>Full name</span>
              <input
                name="fullName"
                type="text"
                placeholder="Arjun Sharma"
                required
                autoFocus
                autoComplete="name"
              />
            </label>

            <label className="field">
              <span>Date of birth</span>
              <input
                name="dob"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>

            <label className="field">
              <span>Gender</span>
              <select name="gender" required>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </label>

            <label className="field">
              <span>Phone <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></span>
              <input
                name="phone"
                type="tel"
                placeholder="+91 98765 43210"
                autoComplete="tel"
              />
            </label>

            <button className="btn-primary" disabled={loading}>
              {loading ? "Setting up…" : "Create my wardrobe"}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  );
}
