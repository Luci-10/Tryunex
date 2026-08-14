import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "../chat";
import { api, type Cloth } from "../api";
import IconButton from "./ui/IconButton";
import Button from "./ui/Button";
import { Input } from "./ui/Field";
import { useConfirm } from "./ui/Confirm";
import { Check, Close, Copy, More, Refresh, Send, Shirt, Sparkles } from "./ui/icons";
import { parseAssistant } from "./chat/parse";
import OutfitCard, { OutfitCardSkeleton } from "./chat/OutfitCard";
import ClothChip from "./chat/ClothChip";
import StyleContextBar from "./chat/StyleContextBar";

const GENERAL_STARTERS = [
  "Build an outfit from my clean clothes",
  "What haven't I worn recently?",
  "Help me plan this week",
  "What should I wear today?",
];

const ATTACHED_STARTERS = [
  "How should I style this?",
  "Make it casual",
  "Dress it up",
  "What goes with it?",
];

export default function ChatPanel() {
  const { open, attached, messages, streaming, busy, closeChat, setAttached, send, stop, clear, retry } =
    useChat();
  const confirm = useConfirm();
  const nav = useNavigate();

  const [input, setInput] = useState("");
  const [wardrobe, setWardrobe] = useState<Map<string, Cloth> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Wardrobe is loaded once per open so `[cloth: id]` references resolve to a
  // name and picture without a fetch per turn.
  useEffect(() => {
    if (!open) return;
    api
      .get<{ clothes: Cloth[] }>("/clothes")
      .then((r) => setWardrobe(new Map(r.clothes.map((c) => [c.id, c]))))
      .catch(() => setWardrobe(new Map()));
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, open]);

  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      restoreRef.current?.focus?.();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false);
      else closeChat();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, menuOpen, closeChat]);

  const wardrobeEmpty = wardrobe !== null && wardrobe.size === 0;
  const starters = attached ? ATTACHED_STARTERS : GENERAL_STARTERS;

  async function newChat() {
    setMenuOpen(false);
    if (messages.length > 0) {
      const ok = await confirm({
        title: "Start a new chat?",
        body: "This conversation is cleared. Nothing you've planned or tried on is affected.",
        confirmLabel: "New chat",
      });
      if (!ok) return;
    }
    clear();
    setAttached(null);
    setInput("");
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop on phones only — the desktop panel is anchored, not modal. */}
      <div
        className="md:hidden fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] animate-fade-in"
        onClick={closeChat}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Ask TryUnex"
        className="fixed z-50 inset-x-0 bottom-0 md:inset-auto md:bottom-6 md:right-6 md:w-[26rem]"
      >
        <div className="bg-white rounded-t-sheet md:rounded-sheet border border-ink/[0.07] shadow-lift flex flex-col h-[82dvh] md:h-[min(38rem,80vh)] overflow-hidden animate-sheet-up">
          <header className="relative flex items-center gap-2 px-4 py-3 border-b border-ink/[0.07] shrink-0">
            <span className="w-8 h-8 rounded-full bg-lilac text-brand-600 grid place-items-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">Ask TryUnex</p>
              <p className="text-[11px] text-ink/65">Outfit ideas from your own wardrobe</p>
            </div>

            <IconButton
              label="Chat options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <More className="w-5 h-5" />
            </IconButton>
            <IconButton label="Close chat" onClick={closeChat}>
              <Close className="w-5 h-5" />
            </IconButton>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                <div
                  role="menu"
                  className="absolute right-3 top-14 z-20 w-44 bg-white rounded-xl border border-ink/10 shadow-lift p-1 animate-fade-in"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={newChat}
                    className="w-full flex items-center gap-2 h-10 px-3 rounded-lg text-[13.5px] text-left hover:bg-ink/[0.04]"
                  >
                    <Refresh className="w-4 h-4 shrink-0" />
                    New chat
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      closeChat();
                    }}
                    className="w-full flex items-center gap-2 h-10 px-3 rounded-lg text-[13.5px] text-left hover:bg-ink/[0.04]"
                  >
                    <Close className="w-4 h-4 shrink-0" />
                    Close chat
                  </button>
                </div>
              </>
            )}
          </header>

          {attached && (
            <div className="px-4 py-2 border-b border-ink/[0.07] shrink-0">
              <span className="inline-flex items-center gap-2 pl-1 pr-1 py-1 rounded-full bg-brand-50 border border-brand-200 max-w-full">
                <img
                  src={attached.imageUrl}
                  alt={attached.name}
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
                <span className="text-[13px] font-medium text-brand-700 truncate">{attached.name}</span>
                <IconButton
                  label={`Stop asking about ${attached.name}`}
                  size="sm"
                  tone="brand"
                  onClick={() => setAttached(null)}
                >
                  <Close className="w-3.5 h-3.5" />
                </IconButton>
              </span>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
            {messages.length === 0 && !streaming && (
              <Welcome
                wardrobeEmpty={wardrobeEmpty}
                loading={wardrobe === null}
                attachedName={attached?.name ?? null}
                starters={starters}
                onPick={send}
                onTryOn={() => {
                  closeChat();
                  nav("/tryon");
                }}
                onAddFirst={() => {
                  closeChat();
                  nav("/");
                }}
              />
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <UserBubble key={i} text={m.content} />
              ) : (
                <AssistantTurn
                  key={i}
                  text={m.content}
                  wardrobe={wardrobe}
                  showActions={!busy && i === messages.length - 1}
                  onRetry={retry}
                />
              ),
            )}

            {streaming && <AssistantTurn text={streaming} wardrobe={wardrobe} showActions={false} />}
            {busy && !streaming && <Typing />}
          </div>

          {busy && (
            <div className="px-4 pb-2 shrink-0">
              <Button variant="secondary" size="sm" block onClick={stop}>
                Stop generating
              </Button>
            </div>
          )}

          {!wardrobeEmpty && <StyleContextBar />}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
              setInput("");
            }}
            className="border-t border-ink/[0.07] p-3 flex gap-2 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={attached ? `Ask about ${attached.name}…` : "Ask anything…"}
              aria-label="Message"
              disabled={busy}
              className="!rounded-full"
            />
            <Button
              type="submit"
              disabled={busy || !input.trim()}
              className="!w-11 !px-0 !rounded-full shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- welcome */

function Welcome({
  wardrobeEmpty,
  loading,
  attachedName,
  starters,
  onPick,
  onTryOn,
  onAddFirst,
}: {
  wardrobeEmpty: boolean;
  loading: boolean;
  attachedName: string | null;
  starters: string[];
  onPick: (s: string) => void;
  onTryOn: () => void;
  onAddFirst: () => void;
}) {
  if (loading) return null;

  // Nothing to style yet — suggesting outfits would be nonsense.
  if (wardrobeEmpty) {
    return (
      <div className="pt-4 text-center flex flex-col items-center gap-3">
        <span className="w-12 h-12 rounded-full bg-lilac text-brand-600 grid place-items-center">
          <Shirt className="w-6 h-6" />
        </span>
        <div>
          <p className="text-[14.5px] font-semibold">Add a piece first</p>
          <p className="text-[13px] text-ink/65 leading-relaxed mt-1 max-w-[15rem] mx-auto">
            I can only suggest clothes you actually own. Add your first garment and I'll take it
            from there.
          </p>
        </div>
        <Button size="sm" onClick={onAddFirst}>
          Go to my wardrobe
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      <p className="text-sm text-ink/70 leading-relaxed">
        {attachedName ? (
          <>
            Let's work on <strong className="text-ink">{attachedName}</strong>. Ask me anything, or
            start here:
          </>
        ) : (
          <>Hi 👋 I know what's in your wardrobe. Where shall we start?</>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {starters.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="text-[13px] bg-brand-50 hover:bg-brand-100 active:bg-brand-200 text-brand-700 px-3 h-9 rounded-full transition-colors"
          >
            {q}
          </button>
        ))}
        {attachedName && (
          <button
            type="button"
            onClick={onTryOn}
            className="text-[13px] bg-mint hover:brightness-95 text-emerald-800 px-3 h-9 rounded-full inline-flex items-center gap-1.5 transition-[filter]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Try it on
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- turns */

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed bg-brand-500 text-white rounded-2xl rounded-br-md">
        {text}
      </div>
    </div>
  );
}

function AssistantTurn({
  text,
  wardrobe,
  showActions,
  onRetry,
}: {
  text: string;
  wardrobe: Map<string, Cloth> | null;
  showActions: boolean;
  onRetry?: () => void;
}) {
  const segments = useMemo(() => parseAssistant(text), [text]);
  const map = wardrobe ?? new Map<string, Cloth>();

  return (
    <div className="flex gap-2">
      <span className="w-6 h-6 rounded-full bg-lilac text-brand-600 grid place-items-center shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="space-y-1">
          {segments.map((s, i) => {
            if (s.type === "text")
              return (
                <p key={i} className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                  {s.value.trim()}
                </p>
              );
            if (s.type === "outfit-pending") return <OutfitCardSkeleton key={i} />;
            if (s.type === "outfit") return <OutfitCard key={i} outfit={s.outfit} wardrobe={map} />;
            const cloth = map.get(s.id);
            // An id we can't resolve is dropped rather than shown as noise.
            return cloth ? <ClothChip key={i} cloth={cloth} /> : null;
          })}
        </div>
        {showActions && <TurnActions text={text} onRetry={onRetry} />}
      </div>
    </div>
  );
}

function TurnActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  async function copy() {
    // Strip the machine-readable markers — nobody wants those on their clipboard.
    const clean = text
      .replace(/\[\[outfit\]\][\s\S]*?\[\[\/outfit\]\]/g, "")
      .replace(/\[cloth:\s*[^\]]+\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    try {
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the message is still on screen to select */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      {onRetry && (
        <MiniAction onClick={onRetry} icon={<Refresh className="w-3.5 h-3.5" />}>
          Retry
        </MiniAction>
      )}
      <MiniAction
        onClick={copy}
        icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      >
        {copied ? "Copied" : "Copy"}
      </MiniAction>
      <MiniAction onClick={() => setVote("up")} active={vote === "up"}>
        👍
      </MiniAction>
      <MiniAction onClick={() => setVote("down")} active={vote === "down"}>
        👎
      </MiniAction>
      {vote && (
        // Said plainly: this goes nowhere. Better than implying it trains something.
        <span className="text-[11px] text-ink/55 ml-0.5" role="status">
          Noted on this device only
        </span>
      )}
    </div>
  );
}

function MiniAction({
  onClick,
  icon,
  active,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap-44 inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[12px] transition-colors ${
        active ? "bg-brand-100 text-brand-700" : "text-ink/60 hover:bg-ink/[0.05] hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Typing() {
  return (
    <div className="flex gap-2" aria-label="TryUnex is typing">
      <span className="w-6 h-6 rounded-full bg-lilac text-brand-600 grid place-items-center shrink-0">
        <Sparkles className="w-3.5 h-3.5" />
      </span>
      <div className="bg-ink/[0.05] rounded-2xl rounded-bl-md px-3.5 py-3 flex gap-1">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full bg-ink/35 animate-bounce"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
