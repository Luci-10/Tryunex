import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Sheet from "./ui/Sheet";
import useMediaQuery from "../useMediaQuery";
import { Bell, Check } from "./ui/icons";

type Note = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

type Feed = { unread: number; notifications: Note[] };

/** "just now", "2h", "3d" — short enough to sit beside a title. */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  const days = Math.floor(mins / 1440);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The notification tray, beside the profile control.
 *
 * Polls rather than holding a socket open: this is a serverless backend, and a
 * quiet 60-second check costs far less than the machinery a live connection
 * would need. It also pauses while the tab is hidden, so a forgotten tab does
 * not sit making requests all day.
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [feed, setFeed] = useState<Feed>({ unread: 0, notifications: [] });
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    if (!user) return;
    api.get<Feed>("/notifications").then(setFeed).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, load]);

  // Close a desktop popover on an outside click or Escape.
  useEffect(() => {
    if (!open || !isDesktop) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isDesktop]);

  const markAll = async () => {
    setFeed((f) => ({ unread: 0, notifications: f.notifications.map((n) => ({ ...n, read: true })) }));
    try {
      setFeed(await api.post<Feed>("/notifications/read", {}));
    } catch {
      load();
    }
  };

  const openNote = async (n: Note) => {
    setOpen(false);
    if (!n.read) {
      setFeed((f) => ({
        unread: Math.max(0, f.unread - 1),
        notifications: f.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      }));
      api.post("/notifications/read", { id: n.id }).catch(() => {});
    }
    if (n.link) nav(n.link);
  };

  if (!user) return null;

  const body = (
    <>
      <div className="flex items-center gap-2 px-1 pb-2">
        <h2 className="text-[15px] font-bold tracking-tight">Notifications</h2>
        {feed.unread > 0 && (
          <button
            type="button"
            onClick={markAll}
            className="tap-44 ml-auto text-[12.5px] font-semibold text-brand-700 hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      {feed.notifications.length === 0 ? (
        <div className="px-3 py-8 text-center">
          <span className="w-12 h-12 rounded-full bg-lilac text-brand-600 grid place-items-center mx-auto">
            <Check className="w-6 h-6" />
          </span>
          <p className="text-[14px] font-semibold mt-3">You're all caught up</p>
          <p className="text-[12.5px] text-ink/60 mt-1 leading-relaxed">
            Messages about your listings, sales and shared wardrobes appear here.
          </p>
        </div>
      ) : (
        <ul className="max-h-[60vh] overflow-y-auto -mx-1">
          {feed.notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openNote(n)}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex gap-2.5 min-h-[52px] transition-colors hover:bg-ink/[0.04] ${
                  n.read ? "" : "bg-brand-50/60"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    n.read ? "bg-transparent" : "bg-brand-500"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold leading-tight">{n.title}</span>
                    <span className="text-[11px] text-ink/50 ml-auto shrink-0">
                      {ago(n.createdAt)}
                    </span>
                  </span>
                  {n.body && (
                    <span className="block text-[12.5px] text-ink/65 leading-snug mt-0.5">
                      {n.body}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          feed.unread > 0 ? `Notifications, ${feed.unread} unread` : "Notifications"
        }
        className={`relative grid place-items-center w-11 h-11 rounded-full transition-colors ${
          open ? "bg-brand-50" : "hover:bg-ink/[0.04]"
        }`}
      >
        <Bell className="w-[21px] h-[21px] text-ink/70" />
        {feed.unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-coral text-white text-[10px] font-bold grid place-items-center">
            {feed.unread > 9 ? "9+" : feed.unread}
          </span>
        )}
      </button>

      {isDesktop ? (
        open && (
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-[calc(100%+8px)] w-[21rem] rounded-[20px] border border-ink/[0.08] bg-white shadow-lift p-2.5 animate-sheet-up z-40"
          >
            {body}
          </div>
        )
      ) : (
        <Sheet open={open} onClose={() => setOpen(false)} title="Notifications">
          {body}
        </Sheet>
      )}
    </div>
  );
}
