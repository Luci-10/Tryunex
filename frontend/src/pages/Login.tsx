import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import { useAuth } from "../auth";
import Button from "../components/ui/Button";
import OtpInput from "../components/ui/OtpInput";
import { Input, Label, FieldError } from "../components/ui/Field";
import { ChevronLeft, Mail } from "../components/ui/icons";
import {
  Features,
  HeroArt,
  HowItWorks,
  Reveal,
  ValueStrip,
} from "../components/landing/Sections";

const RESEND_SECONDS = 30;

/**
 * The public landing page and the sign-in flow are one screen.
 *
 * The auth logic below is unchanged from the previous version — same
 * endpoints, same OTP step machine, same resend cooldown. Only the page
 * around it is new. The form stays inline (rather than in a modal) so the
 * mobile keyboard never fights a dialog, and every CTA simply scrolls to it
 * and moves focus into the email field.
 */
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
  const emailRef = useRef<HTMLInputElement>(null);

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

  /** Every "start"/"sign in" control lands the caret in the email field. */
  const goToSignIn = useCallback(() => {
    const el = document.getElementById("signin");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    // After the scroll settles, so focus doesn't cancel it.
    setTimeout(() => emailRef.current?.focus(), reduce ? 0 : 420);
  }, []);

  function goToHow() {
    const el = document.getElementById("how");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // Move focus as well as the viewport: a keyboard or screen-reader user who
    // activates an in-page link should land in the section, not stay behind in
    // the hero with the page silently scrolled beneath them.
    setTimeout(() => el.focus({ preventScroll: true }), reduce ? 0 : 420);
  }

  return (
    <div className="relative min-h-full overflow-x-hidden">
      <Backdrop />

      {/* ------------------------------------------------------------ nav */}
      <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-md border-b border-ink/[0.06] pt-safe">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="flex items-center gap-2 font-bold text-brand-700 tracking-tight">
            <img src="/favicon.svg" alt="" className="w-6 h-6" />
            TryUnex
          </span>
          <nav aria-label="Landing" className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={goToHow}
              className="hidden sm:inline-flex tap-44 h-10 px-3 items-center whitespace-nowrap rounded-full text-[14px] text-ink/70 hover:bg-ink/[0.04] hover:text-ink transition-colors"
            >
              How it works
            </button>
            <button
              type="button"
              onClick={goToSignIn}
              className="hidden sm:inline-flex tap-44 h-10 px-3 items-center whitespace-nowrap rounded-full text-[14px] text-ink/70 hover:bg-ink/[0.04] hover:text-ink transition-colors"
            >
              Sign in
            </button>
            <Button size="sm" onClick={goToSignIn} className="tap-44 whitespace-nowrap">
              Start styling
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-14 space-y-14 sm:space-y-20">
        {/* --------------------------------------------------------- hero */}
        <section className="pt-8 sm:pt-12 grid gap-8 lg:grid-cols-2 lg:items-center">
          {/* Text first on mobile, image second — the order in the DOM. */}
          <Reveal>
            <p className="inline-flex items-center rounded-full bg-lilac text-brand-700 px-3 py-1.5 text-[12px] font-semibold">
              Your wardrobe, styled smarter
            </p>
            <h1 className="text-[32px] sm:text-[44px] lg:text-[52px] font-bold tracking-tight leading-[1.08] mt-4">
              Wear more of what you already own.
            </h1>
            <p className="text-[15.5px] sm:text-[17px] text-ink/70 leading-relaxed mt-4 max-w-lg">
              Organise your wardrobe, plan outfits, try looks on virtually, and discover pre-loved
              pieces—all in one calm space.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-6">
              <Button size="lg" onClick={goToSignIn} className="sm:w-auto">
                Start styling free
              </Button>
              <Button size="lg" variant="secondary" onClick={goToHow} className="sm:w-auto">
                See how it works
              </Button>
            </div>

            <p className="text-[13px] text-ink/60 mt-4">3 free try-on credits · No card required</p>
          </Reveal>

          {/* Capped: a full-width 4:5 portrait is taller than the copy beside
              it, which leaves a void on the left at desktop widths. */}
          <Reveal delay={120} className="w-full max-w-[420px] mx-auto lg:mr-0 lg:ml-auto">
            <HeroArt />
          </Reveal>
        </section>

        <ValueStrip />

        {/* ------------------------------------------------------ sign in */}
        <section id="signin" className="scroll-mt-20">
          <div className="mx-auto max-w-md rounded-[28px] border border-ink/[0.07] bg-white shadow-lift p-5 sm:p-7">
            {step === "email" ? (
              <form
                key="email"
                onSubmit={(e) => {
                  e.preventDefault();
                  requestOtp();
                }}
                className="space-y-4"
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                    Sign in or join
                  </p>
                  <h2 className="text-[22px] font-bold tracking-tight leading-tight mt-1.5">
                    Create your free wardrobe
                  </h2>
                  <p className="text-[14px] text-ink/65 leading-snug mt-2">
                    One email, one code, and you're in. New here? The same code creates your
                    account.
                  </p>
                </div>

                <label className="block">
                  <Label>Email address</Label>
                  <Input
                    ref={emailRef}
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
              <div key="otp" className="space-y-4">
                <div>
                  <h2 className="text-[21px] font-bold tracking-tight leading-tight">
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

                {info && !error && <p className="text-[13px] text-emerald-700 text-center">{info}</p>}
              </div>
            )}

            {/* Announced without stealing focus from the field in use. */}
            <p aria-live="polite" className="sr-only">
              {error ?? info ?? ""}
            </p>
          </div>
        </section>

        <div id="how" tabIndex={-1} className="scroll-mt-20 outline-none">
          <HowItWorks />
        </div>

        <Features />

        {/* ---------------------------------------------------- final CTA */}
        <Reveal>
          <section
            className="rounded-[28px] border border-ink/[0.06] px-6 py-10 sm:py-14 text-center"
            style={{
              background:
                "linear-gradient(135deg, #EEE9FF 0%, #F6F3FF 38%, #FFE1D2 78%, #CFF4DF 100%)",
            }}
          >
            <h2 className="text-[24px] sm:text-[32px] font-bold tracking-tight leading-[1.15] max-w-xl mx-auto">
              Your best wardrobe is the one you already have.
            </h2>
            <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
              <Button size="lg" onClick={goToSignIn}>
                Create your free wardrobe
              </Button>
              <Button size="lg" variant="secondary" onClick={goToSignIn}>
                Sign in
              </Button>
            </div>
            <p className="text-[13px] text-ink/60 mt-4">3 free try-on credits · No card required</p>
          </section>
        </Reveal>
      </main>

      {/* --------------------------------------------------------- footer */}
      <footer className="border-t border-ink/[0.07]">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-wrap items-center gap-x-5 gap-y-2 justify-center sm:justify-between">
          <p className="text-[12.5px] text-ink/55">
            © {new Date().getFullYear()} TryUnex · Your wardrobe, your photos, your call.
          </p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
            {/* Privacy and Terms are deliberately absent: those pages do not
                exist yet, and a footer link to a dead route is worse than no
                link. Add the routes and they belong here. */}
            {[
              { to: "/about", label: "About" },
              { to: "/contact", label: "Contact" },
            ].map((l) => (
              <a
                key={l.to}
                href={l.to}
                className="tap-44 text-[12.5px] text-ink/60 hover:text-brand-700 hover:underline"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
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
          "radial-gradient(40rem 28rem at 8% -8%, rgba(118,87,232,0.16), transparent 62%)," +
          "radial-gradient(32rem 24rem at 100% 2%, rgba(255,225,210,0.60), transparent 60%)," +
          "radial-gradient(30rem 24rem at 88% 96%, rgba(220,238,255,0.70), transparent 60%)," +
          "radial-gradient(34rem 26rem at 6% 104%, rgba(207,244,223,0.55), transparent 60%)," +
          "#FCFAFF",
      }}
    />
  );
}
