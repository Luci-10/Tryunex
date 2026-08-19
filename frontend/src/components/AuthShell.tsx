import type { ReactNode } from "react";

/**
 * Calm branded shell for the signed-out screens: a soft orb backdrop, a
 * compact logo, and exactly one card to look at.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-full flex flex-col items-center justify-center px-4 py-10 overflow-hidden">
      {/* Decorative — no alt text, not announced. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(38rem 26rem at 15% -10%, rgba(118,87,232,0.22), transparent 62%)," +
            "radial-gradient(30rem 22rem at 100% 4%, rgba(255,225,210,0.85), transparent 60%)," +
            "radial-gradient(32rem 26rem at 50% 112%, rgba(207,244,223,0.7), transparent 60%)",
        }}
      />
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src="/logo-192.png" alt="" className="w-8 h-8" />
          <span className="text-xl font-bold text-brand-700 tracking-tight">TryUnex</span>
        </div>

        <div className="bg-white/95 backdrop-blur rounded-sheet border border-ink/[0.06] shadow-lift p-6">
          <h1 className="text-[20px] font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-ink/65 mt-1 leading-snug">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-4 text-center text-xs text-ink/65">{footer}</div>}
      </div>
    </div>
  );
}
