import type { ReactNode } from "react";
import { AppHeader, MobileNav } from "./Nav";

/**
 * Every authenticated screen sits in this. It owns the header, the phone
 * bottom bar, page padding (16px on mobile), the max content width, and the
 * bottom clearance so nothing hides under the tab bar or the home indicator.
 */
export default function PageShell({
  children,
  width = "default",
}: {
  children: ReactNode;
  /** `narrow` for single-column forms, `wide` for the try-on studio. */
  width?: "narrow" | "default" | "wide";
}) {
  const max =
    width === "narrow" ? "max-w-xl" : width === "wide" ? "max-w-6xl" : "max-w-6xl";
  return (
    <div className="min-h-full blobs">
      <AppHeader />
      <main className={`${max} mx-auto w-full px-4 pt-4 pb-nav md:pb-10 space-y-5`}>{children}</main>
      <MobileNav />
    </div>
  );
}

/** Page title block — one h1 per screen, optional supporting line and action. */
export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink/65 mt-1 leading-snug">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
