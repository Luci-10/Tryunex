import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

const TABS = [
  { to: "/", label: "Wardrobe", end: true },
  { to: "/worn", label: "Worn" },
  { to: "/plan", label: "Plan" },
  { to: "/tryon", label: "Try-on" },
  { to: "/shared", label: "Shared" },
  { to: "/history", label: "History" },
  { to: "/account", label: "Account" },
];

export default function Nav() {
  const { user } = useAuth();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);

  // When the route changes, scroll the active tab into view so the user
  // never has to scroll the tab strip to find where they are.
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <NavLink to="/" className="font-bold text-brand-700 text-lg">Tryunex</NavLink>
        {user && <span className="text-sm text-gray-600 hidden sm:block">Hi, {user.name}</span>}
      </div>
      <nav
        ref={navRef}
        className="max-w-5xl mx-auto px-2 pb-2 flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-thin"
      >
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `px-2.5 sm:px-3 py-1.5 rounded-full whitespace-nowrap text-xs sm:text-sm ${
                isActive ? "bg-brand-600 text-white" : "hover:bg-brand-50"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
