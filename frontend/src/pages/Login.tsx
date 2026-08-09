import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import { useAuth } from "../auth";
import Button from "../components/ui/Button";
import OtpInput from "../components/ui/OtpInput";
import { Input, Label, FieldError } from "../components/ui/Field";
import { ChevronLeft, Mail } from "../components/ui/icons";
import { FeatureCarousel, HeroPanel, ProductPreview } from "../components/login/LoginArt";

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

  // Client-side rate limit so the resend button can't be mashed while the
  // first mail is still in flight.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestOtp(resend = false) {
    setError(null);
    if (!email.trim()) return;
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

  async function verify(code: string) {
    if (busy || code.length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<
        { status: "logged_in"; user: User } | { status: "needs_registration"; email: string }
      >("/auth/verify", { email, otp: code });
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
    <div className="relative min-h-full overflow-x-hidden">
      <Backdrop />

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10 lg:py-14 lg:min-h-[100dvh] lg:flex lg:items-center">
        <div className="w-full lg:grid lg:grid-cols-2 lg:rounded-[28px] lg:overflow-hidden lg:border lg:border-ink/[0.07] lg:bg-white lg:shadow-lift">
          <HeroPanel />

          <div className="lg:p-10 xl:p-12 lg:flex lg:flex-col lg:justify-center">
            {/* Phone/tablet story: compact logo, one line, one preview, then
                the benefits as a swipeable strip. Desktop gets all of this in
                the hero panel instead. */}
            <div className="lg:hidden space-y-5 mb-6">
              <div className="flex items-center gap-2">
                <img src="/favicon.svg" alt="" className="w-7 h-7" />
                <span className="text-[17px] font-bold text-brand-700 tracking-tight">TryUnex</span>
              </div>

              <div>
                <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight leading-[1.15]">
                  Dress with more joy, every day.
                </h1>
                <p className="text-[15px] text-ink/70 leading-relaxed mt-2">
                  Save your pieces, plan your looks, and try outfits on before you wear them.
                </p>
              </div>

              <ProductPreview />
              <FeatureCarousel />
            </div>

            <div className="rounded-3xl border border-ink/[0.07] bg-white shadow-card lg:shadow-none lg:border-0 lg:rounded-none p-5 sm:p-6 lg:p-0">
              {step === "email" ? (
                <form
                  key="email"
                  onSubmit={(e) => {
                    e.preventDefault();
                    requestOtp();
                  }}
                  className="space-y-4 animate-sheet-up"
                >
                  <div>
                    <h2 className="text-[20px] lg:text-[24px] font-bold tracking-tight leading-tight">
                      Meet your wardrobe's new favourite place
                    </h2>
                  </div>

                  <label className="block">
                    <Label>Email address</Label>
                    <Input
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      aria-invalid={error ? true : undefined}
                      className="h-12"
                    />
                    <FieldError>{error}</FieldError>
                  </label>

                  <Button
                    type="submit"
                    size="lg"
                    block
                    loading={busy}
                    leading={!busy ? <Mail className="w-4 h-4" /> : undefined}
                  >
                    {busy ? "Sending code…" : "Send me a code"}
                  </Button>

                  <p className="text-[13px] text-ink/60 text-center">No password to remember.</p>
                </form>
              ) : (
                <div key="otp" className="space-y-4 animate-sheet-up">
                  <div>
                    <h2 className="text-[20px] lg:text-[24px] font-bold tracking-tight leading-tight">
                      Check your email
                    </h2>
                    <p className="text-[14px] text-ink/70 mt-1.5 flex flex-wrap items-center gap-x-2">
                      <span>
                        Code sent to <strong className="text-ink font-semibold">{email}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={backToEmail}
                        className="tap-44 inline-flex items-center gap-0.5 text-brand-700 font-semibold hover:underline"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Change
                      </button>
                    </p>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      verify(otp);
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <Label>6-digit code</Label>
                      <OtpInput
                        value={otp}
                        onChange={(v) => {
                          setOtp(v);
                          if (error) setError(null);
                        }}
                        onComplete={verify}
                        disabled={busy}
                        invalid={Boolean(error)}
                        autoFocus
                      />
                      <FieldError>{error}</FieldError>
                    </div>

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

                  {info && !error && (
                    <p className="text-[13px] text-emerald-700 text-center">{info}</p>
                  )}
                </div>
              )}

              {/* Announced without stealing focus from the field in use. */}
              <p aria-live="polite" className="sr-only">
                {error ?? info ?? ""}
              </p>
            </div>

            <p className="text-[12.5px] text-ink/60 text-center mt-5 lg:mt-6">
              Your wardrobe, your photos, your call on who sees them.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Off-white ground with soft lavender, peach, mint and sky washes. */
function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-canvas"
      style={{
        background:
          "radial-gradient(40rem 28rem at 8% -8%, rgba(118,87,232,0.20), transparent 62%)," +
          "radial-gradient(32rem 24rem at 100% 2%, rgba(255,225,210,0.75), transparent 60%)," +
          "radial-gradient(30rem 24rem at 88% 96%, rgba(220,238,255,0.85), transparent 60%)," +
          "radial-gradient(34rem 26rem at 6% 104%, rgba(207,244,223,0.70), transparent 60%)," +
          "#FCFAFF",
      }}
    />
  );
}
