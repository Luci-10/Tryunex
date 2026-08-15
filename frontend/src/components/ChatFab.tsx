import { useChat } from "../chat";
import { useAuth } from "../auth";
import { Chat } from "./ui/icons";

/**
 * Floating "Ask AI" entry point on every signed-in page. Hidden while the
 * panel is open — the panel header owns the close control. Sits above the
 * phone tab bar; the wardrobe's "+" FAB stacks above this one.
 */
export default function ChatFab() {
  const { user } = useAuth();
  const { open, openChat } = useChat();
  if (!user || open) return null;
  return (
    <button
      type="button"
      onClick={() => openChat()}
      aria-label="Ask AI about your wardrobe"
      data-tour-id="chat-fab"
      className="fixed right-4 z-30 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 w-14 h-14 rounded-full bg-ink text-white shadow-lift grid place-items-center transition-transform active:scale-95"
    >
      <Chat className="w-6 h-6" />
    </button>
  );
}
