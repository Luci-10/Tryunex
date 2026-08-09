import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Users } from "./ui/icons";

type Accessible = { id: string; ownerId: string; ownerName: string };

/**
 * Horizontal pills for "my wardrobe" plus every friend who shared theirs.
 * Renders nothing when nobody has shared — no point spending a row on a
 * one-option switcher.
 */
export default function WardrobeSwitcher({ current }: { current: "mine" | string }) {
  const nav = useNavigate();
  const [accessible, setAccessible] = useState<Accessible[] | null>(null);

  useEffect(() => {
    api
      .get<{ shares: Accessible[] }>("/share/i-can-see")
      .then((r) => setAccessible(r.shares))
      .catch(() => setAccessible([]));
  }, []);

  if (!accessible || accessible.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="group" aria-label="Choose a wardrobe">
      <Pill active={current === "mine"} onClick={() => nav("/")}>
        My wardrobe
      </Pill>
      {accessible.map((a) => (
        <Pill key={a.ownerId} active={current === a.ownerId} onClick={() => nav(`/friends/${a.ownerId}`)}>
          {a.ownerName}
        </Pill>
      ))}
      <NavLink
        to="/shared"
        className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full text-sm whitespace-nowrap border border-dashed border-brand-300 text-brand-700 hover:bg-brand-50 shrink-0"
      >
        <Users className="w-4 h-4" />
        Connect
      </NavLink>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`h-9 px-3.5 rounded-full text-sm whitespace-nowrap border shrink-0 transition-colors ${
        active
          ? "bg-ink text-white border-ink font-medium"
          : "bg-white text-ink/70 border-ink/10 hover:bg-ink/[0.04]"
      }`}
    >
      {children}
    </button>
  );
}
