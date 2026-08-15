import { useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api, type User } from "../api";
import Sheet from "./ui/Sheet";
import { useConfirm } from "./ui/Confirm";
import { Avatar } from "./Nav";
import {
  Basket,
  ChevronRight,
  Clock,
  Info,
  Logout,
  Mail,
  Settings,
  Shirt,
  Sparkles,
  UserIcon,
  Users,
} from "./ui/icons";

type Tone = "lilac" | "sky" | "mint" | "peach" | "butter" | "ink";

export type MenuItem = {
  to: string;
  label: string;
  hint: string;
  icon: typeof Shirt;
  tone: Tone;
};

/**
 * Everything that isn't a daily wardrobe action. One list, rendered by both
 * the desktop popover and the phone sheet — there is no second copy of this
 * anywhere.
 */
export const PROFILE_ITEMS: MenuItem[] = [
  { to: "/account", label: "My profile", hint: "Your details and suggestions", icon: UserIcon, tone: "lilac" },
  { to: "/shared", label: "Shared wardrobes", hint: "Who can see yours, and theirs", icon: Users, tone: "sky" },
  { to: "/history", label: "Wear history", hint: "Everything you've worn", icon: Clock, tone: "mint" },
  { to: "/worn", label: "Laundry pile", hint: "Pieces waiting to be washed", icon: Basket, tone: "peach" },
  { to: "/plans", label: "Plans & credits", hint: "Try-on credits and your plan", icon: Sparkles, tone: "mint" },
  { to: "/settings", label: "Settings", hint: "Motion, privacy and account", icon: Settings, tone: "ink" },
  { to: "/contact", label: "Contact & support", hint: "Questions, bugs, ideas", icon: Mail, tone: "butter" },
  { to: "/about", label: "About TryUnex", hint: "What this app is for", icon: Info, tone: "lilac" },
];

/** Routes that live behind the profile menu — used to light up its trigger. */
export const PROFILE_ROUTES = PROFILE_ITEMS.map((i) => i.to);

const TONES: Record<Tone, string> = {
  lilac: "bg-lilac text-brand-700",
  sky: "bg-sky text-blue-800",
  mint: "bg-mint text-emerald-800",
  peach: "bg-peach text-orange-800",
  butter: "bg-butter text-amber-800",
  ink: "bg-ink/[0.06] text-ink/70",
};

/** Sign-out, with the confirmation flow the app has always used. */
export function useSignOut(onBeforeConfirm?: () => void) {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const confirm = useConfirm();

  return async function signOut() {
    onBeforeConfirm?.();
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
  };
}

function IdentityCard({ user, onNavigate }: { user: User; onNavigate: () => void }) {
  return (
    <div className="rounded-2xl border border-brand-200/70 bg-gradient-to-br from-lilac via-lilac/60 to-white p-3.5">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[15px] truncate leading-tight">{user.name}</p>
          <p className="text-[12.5px] text-ink/65 truncate mt-0.5">{user.email}</p>
        </div>
      </div>
      <NavLink
        to="/account"
        onClick={onNavigate}
        className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline tap-44"
      >
        My profile
        <ChevronRight className="w-3.5 h-3.5" />
      </NavLink>
    </div>
  );
}

function MenuRow({ item, onNavigate }: { item: MenuItem; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      role="menuitem"
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-2.5 py-2 min-h-[48px] transition-colors ${
          isActive ? "bg-brand-50" : "hover:bg-ink/[0.04] active:bg-ink/[0.06]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`w-9 h-9 shrink-0 rounded-full grid place-items-center ${TONES[item.tone]}`}>
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block text-[14.5px] leading-tight ${
                isActive ? "text-brand-700 font-semibold" : "text-ink font-medium"
              }`}
            >
              {item.label}
            </span>
            <span className="block text-[12px] text-ink/60 truncate mt-0.5">{item.hint}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-ink/25 shrink-0" />
        </>
      )}
    </NavLink>
  );
}

function SignOutRow({ onSignOut }: { onSignOut: () => void }) {
  return (
    <button
      type="button"
      onClick={onSignOut}
      role="menuitem"
      className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 min-h-[48px] text-coral hover:bg-coral/10 active:bg-coral/15 transition-colors"
    >
      <span className="w-9 h-9 shrink-0 rounded-full grid place-items-center bg-coral/12">
        <Logout className="w-[18px] h-[18px]" />
      </span>
      <span className="text-[14.5px] font-semibold">Sign out</span>
    </button>
  );
}

/** The list itself — identical on both breakpoints. */
function MenuBody({ user, onNavigate }: { user: User; onNavigate: () => void }) {
  const signOut = useSignOut(onNavigate);
  return (
    <>
      <IdentityCard user={user} onNavigate={onNavigate} />
      <ul className="mt-2 space-y-0.5" role="none">
        {PROFILE_ITEMS.map((item) => (
          <li key={item.to} role="none">
            <MenuRow item={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <div className="mt-2 pt-2 border-t border-ink/[0.08]">
        <SignOutRow onSignOut={signOut} />
      </div>
    </>
  );
}

/** Desktop: popover anchored under the profile trigger. */
export function ProfileDropdown({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const { user } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        anchorRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !user) return null;
  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Profile and more"
      className="absolute right-0 top-[calc(100%+8px)] w-[19rem] rounded-[20px] border border-ink/[0.08] bg-white shadow-lift p-2.5 animate-sheet-up z-40"
    >
      <MenuBody user={user} onNavigate={onClose} />
    </div>
  );
}

/** Phones: a proper bottom sheet, not a cramped dropdown. */
export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Profile & more">
      <div role="menu" aria-label="Profile and more">
        <MenuBody user={user} onNavigate={onClose} />
      </div>
    </Sheet>
  );
}
