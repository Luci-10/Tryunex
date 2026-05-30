import { useChat } from "../chat";
import { useAuth } from "../auth";

// Floating "Ask AI" button — bottom-right on every authenticated page.
// Hides while the panel is open (the panel header replaces it with a close X).
export default function ChatFab() {
  const { user } = useAuth();
  const { open, openChat } = useChat();
  if (!user || open) return null;
  return (
    <button
      onClick={() => openChat()}
      aria-label="Ask AI"
      // Sits above the "+" Add FAB (which lives at bottom-5 right-5 on
      // the Wardrobe page). bottom-24 = ~96px so they don't touch.
      className="fixed bottom-24 right-5 z-30 bg-brand-600 hover:bg-brand-700 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center"
    >
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
        <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7l-5 4V6a2 2 0 0 1 2-2zm3 6v2h10v-2H7zm0 4v2h7v-2H7z" />
      </svg>
    </button>
  );
}
