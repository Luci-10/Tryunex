import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";

const TABS = [
  { to: "/", label: "Wardrobe", end: true },
  { to: "/worn", label: "Worn" },
  { to: "/plan", label: "Plan" },
  { to: "/shared", label: "Shared" },
  { to: "/history", label: "History" },
  { to: "/account", label: "Account" },
];

export default function Nav() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <NavLink to="/" className="font-bold text-brand-700 text-lg">Tryunex</NavLink>
        {user && <span className="text-sm text-gray-600 hidden sm:block">Hi, {user.name}</span>}
      </div>
      <nav className="max-w-5xl mx-auto px-2 pb-2 flex gap-1 overflow-x-auto text-sm">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-full whitespace-nowrap ${isActive ? "bg-brand-600 text-white" : "hover:bg-brand-50"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
