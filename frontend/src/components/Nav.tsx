import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import { useConfirm } from "./ui/Confirm";
import { api } from "../api";
import {
  Basket,
  Calendar,
  Clock,
  Logout,
  Mail,
  More,
  Shirt,
  Sparkles,
  UserIcon,
  Users,
} from "./ui/icons";

type Item = { to: string; label: string; icon: typeof Shirt; end?: boolean };

// The four highest-frequency destinations get a permanent slot on the phone
// bottom bar; everything else lives one tap away behind "More".
const PRIMARY: Item[] = [
  { to: "/", label: "Wardrobe", icon: Shirt, end: true },
  { to: "/tryon", label: "Try-on", icon: Sparkles },
  { to: "/plan", label: "Plan", icon: Calendar },
  { to: "/worn", label: "Worn", icon: Basket },
];

const SECONDARY: Item[] = [
  { to: "/shared", label: "Shared wardrobes", icon: Users },
  { to: "/history", label: "Wear history", icon: Clock },
  { to: "/account", label: "Account", icon: UserIcon },
  { to: "/contact", label: "Contact us", icon: Mail },
];

export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded-full bg-brand-500 text-white font-semibold shrink-0 ${
        size === "sm" ? "w-8 h-8 text-[11px]" : "w-9 h-9 text-xs"
      }`}
    >
      {initialsOf(name) || "?"}
    </span>
  );
}

/** Sticky top bar. Full nav on desktop, brand + avatar only on phones. */
export function AppHeader() {
  const { user } = useAuth();
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

        <nav className="hidden md:flex items-center gap-1 ml-4" aria-label="Main">
          {[...PRIMARY, ...SECONDARY].map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `px-3 h-9 inline-flex items-center rounded-full text-sm transition-colors ${
                  isActive
                    ? "bg-brand-500 text-white font-medium"
                    : "text-ink/65 hover:bg-brand-50 hover:text-brand-700"
                }`
              }
            >
              {t.label === "Shared wardrobes"
                ? "Shared"
                : t.label === "Wear history"
                  ? "History"
                  : t.label === "Contact us"
                    ? "Contact"
                    : t.label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <NavLink
            to="/account"
            className="ml-auto flex items-center gap-2 shrink-0"
            aria-label={`Account — signed in as ${user.name}`}
          >
            <span className="hidden lg:block text-sm text-ink/70">{user.name}</span>
            <Avatar name={user.name} />
          </NavLink>
        )}
      </div>
    </header>
  );
}

/** Bottom tab bar — phones only. Sits above the Capacitor home indicator. */
export function MobileNav() {
  const { user, setUser } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;
  const inMore = SECONDARY.some((s) => pathname.startsWith(s.to));

  async function logout() {
    setMoreOpen(false);
    const ok = await confirm({
      title: "Sign out?",
      body: "You'll need your email code to get back in.",
      confirmLabel: "Sign out",
      tone: "danger",
    });
    if (!ok) return;
    await api.post("/auth/logout");
    setUser(null);
    nav("/login", { replace: true });
  }

  return (
    <>
      <nav
        aria-label="Primary"
        className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-white/92 backdrop-blur-md border-t border-ink/[0.07] pb-safe"
      >
        <ul className="flex items-stretch">
          {PRIMARY.map((t) => (
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
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`w-full h-16 flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                inMore ? "text-brand-600 font-semibold" : "text-ink/65"
              }`}
            >
              <More className="w-[22px] h-[22px]" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="space-y-1">
          {SECONDARY.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 h-12 rounded-xl text-[15px] ${
                    isActive ? "bg-brand-50 text-brand-700 font-medium" : "text-ink/80 hover:bg-ink/[0.04]"
                  }`
                }
              >
                <t.icon className="w-5 h-5 shrink-0" />
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-4 border-t border-ink/[0.07]">
          <Button variant="destructive" block leading={<Logout className="w-4 h-4" />} onClick={logout}>
            Sign out
          </Button>
        </div>
      </Sheet>
    </>
  );
}

