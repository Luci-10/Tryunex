import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import useMediaQuery from "../useMediaQuery";
import { ProfileDropdown, ProfileSheet, PROFILE_ROUTES } from "./ProfileMenu";
import { Calendar, ChevronDown, Shirt, Sparkles } from "./ui/icons";

type Item = { to: string; label: string; icon: typeof Shirt; end?: boolean };

/**
 * The only permanent destinations. Everything else — sharing, history,
 * laundry, account, settings, contact, about — lives in the profile menu.
 * This list is the single source of truth for the desktop header and the
 * phone tab bar.
 */
export const PRIMARY_NAV: Item[] = [
  { to: "/", label: "Wardrobe", icon: Shirt, end: true },
  { to: "/plan", label: "Plan", icon: Calendar },
  { to: "/tryon", label: "Try-on", icon: Sparkles },
];

export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "w-8 h-8 text-[11px]",
    md: "w-9 h-9 text-xs",
    lg: "w-11 h-11 text-sm",
  };
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded-full bg-brand-500 text-white font-semibold shrink-0 ${sizes[size]}`}
    >
      {initialsOf(name) || "?"}
    </span>
  );
}

/**
 * Shared open/close state for the profile menu. The trigger lives in the
 * header on both breakpoints; only the presentation differs, so the state
 * and the close-on-route-change rule are defined once.
 */
function useProfileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Choosing a destination closes the menu; so does any other navigation.
  useEffect(() => setOpen(false), [pathname]);

  const onProfileRoute = PROFILE_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  return { open, setOpen, onProfileRoute };
}

/** Sticky top bar: brand, the three primary links on desktop, profile right. */
export function AppHeader() {
  const { user } = useAuth();
  const { open, setOpen, onProfileRoute } = useProfileMenu();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-md border-b border-ink/[0.06] pt-safe">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        <NavLink
          to="/"
          className="flex items-center gap-2 font-bold text-brand-700 tracking-tight shrink-0"
        >
          <img src="/favicon.svg" alt="" className="w-6 h-6" />
          <span>TryUnex</span>
        </NavLink>

        <nav className="hidden md:flex items-center gap-1 ml-5" aria-label="Main">
          {PRIMARY_NAV.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              data-tour-id={t.to === "/tryon" ? "nav-tryon" : undefined}
              className={({ isActive }) =>
                `px-3.5 h-9 inline-flex items-center rounded-full text-sm transition-colors ${
                  isActive
                    ? "bg-brand-500 text-white font-medium"
                    : "text-ink/70 hover:bg-brand-50 hover:text-brand-700"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="ml-auto relative shrink-0">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={`Profile and more — signed in as ${user.name}`}
              className={`flex items-center gap-2 h-11 pl-1 pr-1.5 md:pr-2.5 rounded-full border transition-colors ${
                open || onProfileRoute
                  ? "bg-brand-50 border-brand-200"
                  : "border-transparent hover:bg-ink/[0.04]"
              }`}
            >
              <Avatar name={user.name} />
              <span className="hidden lg:block text-sm text-ink/75 max-w-[9rem] truncate">
                {user.name}
              </span>
              <ChevronDown
                className={`hidden md:block w-4 h-4 text-ink/45 transition-transform duration-200 ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Popover on desktop, sheet on phones — one state, one shell.
                The choice is made in JS, not CSS: the sheet portals into
                <body>, so a `md:hidden` wrapper would not hide it and its
                full-screen backdrop would swallow every click on the popover. */}
            {isDesktop ? (
              <ProfileDropdown open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} />
            ) : (
              <ProfileSheet open={open} onClose={() => setOpen(false)} />
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** Bottom tab bar — phones only, three destinations, nothing else. */
export function MobileNav() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-white/92 backdrop-blur-md border-t border-ink/[0.07] pb-safe"
    >
      <ul className="flex items-stretch">
        {PRIMARY_NAV.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `h-16 flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                  isActive ? "text-brand-600 font-semibold" : "text-ink/65"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <t.icon className={isActive ? "w-6 h-6" : "w-[22px] h-[22px]"} />
                  <span>{t.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
