import { useEffect, useRef, useState } from "react";
import { useChat } from "../chat";
import { useTryOn } from "../tryon";
import { api, API_BASE, type Cloth } from "../api";
import IconButton from "./ui/IconButton";
import Button from "./ui/Button";
import { Input } from "./ui/Field";
import { Close, Send, Sparkles } from "./ui/icons";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What should I wear today?",
  "I have an event tonight",
  "What's in my wardrobe?",
];

// Matches `[cloth: <id>]` tokens emitted by the model (see the system prompt
// in backend/src/routes/chat.ts). Tolerant of stray whitespace.
const CLOTH_TOKEN = /\[cloth:\s*([^\]\s]+)\s*\]/g;

export default function ChatPanel() {
  const { open, attached, closeChat, setAttached } = useChat();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [wardrobe, setWardrobe] = useState<Map<string, Cloth>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Load the wardrobe once per open so [cloth: id] tokens resolve to a name
  // and image without a fetch per turn.
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

  // Focus the composer on open, hand focus back to the trigger on close.
  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setAttached(null);
      restoreRef.current?.focus?.();
    }
  }, [open, setAttached]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChat();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeChat]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setStreaming("");

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, attachedClothId: attached?.id }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          let evName = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) evName = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (evName === "delta") {
            acc += parsed.text;
            setStreaming(acc);
          } else if (evName === "error") {
            throw new Error(parsed.message ?? "stream error");
          }
        }
      }
      if (acc) setMessages([...next, { role: "assistant", content: acc }]);
    } catch (err: any) {
      setMessages([...next, { role: "assistant", content: `⚠️ ${err.message ?? "Chat failed"}` }]);
    } finally {
      setBusy(false);
      setStreaming("");
    }
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
        className="fixed z-50 inset-x-0 bottom-0 md:inset-auto md:bottom-6 md:right-6 md:w-[400px]"
      >
        <div className="bg-white rounded-t-sheet md:rounded-sheet border border-ink/[0.07] shadow-lift flex flex-col h-[78dvh] md:h-[min(34rem,72vh)] overflow-hidden animate-sheet-up">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-ink/[0.07] shrink-0">
            <span className="w-8 h-8 rounded-full bg-lilac text-brand-600 grid place-items-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">Ask TryUnex</p>
              <p className="text-[11px] text-ink/65">Outfit ideas from your own wardrobe</p>
            </div>
            <IconButton label="Close chat" onClick={closeChat}>
              <Close className="w-5 h-5" />
            </IconButton>
          </header>

          {attached && (
            <div className="px-4 py-2 border-b border-ink/[0.07] shrink-0">
              <span className="inline-flex items-center gap-2 pl-1 pr-1 py-1 rounded-full bg-brand-50 border border-brand-200 max-w-full">
                <img
                  src={attached.imageUrl}
                  alt={attached.name}
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
                <span className="text-[13px] font-medium text-brand-700 truncate">
                  {attached.name}
                </span>
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

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
          >
            {messages.length === 0 && !streaming && (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-ink/70 leading-relaxed">
                  Hi 👋 I can suggest outfits, help plan your week, or answer questions about what
                  you own.
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="text-[13px] bg-brand-50 hover:bg-brand-100 text-brand-700 px-3 h-9 rounded-full"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.content} wardrobe={wardrobe} />
            ))}
            {streaming && <Bubble role="assistant" text={streaming} wardrobe={wardrobe} />}
            {busy && !streaming && <Typing />}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-ink/[0.07] p-3 flex gap-2 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              aria-label="Message"
              disabled={busy}
              className="!rounded-full"
            />
            <Button type="submit" disabled={busy || !input.trim()} className="!w-11 !px-0 !rounded-full">
              <Send className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

function Typing() {
  return (
    <div className="flex justify-start" aria-label="TryUnex is typing">
      <div className="bg-ink/[0.05] rounded-2xl px-3.5 py-3 flex gap-1">
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

function Bubble({
  role,
  text,
  wardrobe,
}: {
  role: "user" | "assistant";
  text: string;
  wardrobe: Map<string, Cloth>;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[85%] px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
          isUser
            ? "bg-brand-500 text-white rounded-2xl rounded-br-md"
            : "bg-ink/[0.05] text-ink rounded-2xl rounded-bl-md"
        }`}
      >
        {isUser ? text : renderAssistantText(text, wardrobe)}
      </div>
    </div>
  );
}

function renderAssistantText(text: string, wardrobe: Map<string, Cloth>) {
  const parts: Array<{ type: "text" | "cloth"; value: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CLOTH_TOKEN.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "cloth", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        const cloth = wardrobe.get(p.value);
        if (!cloth) return <span key={i} className="text-ink/55 italic">[unknown piece]</span>;
        return <ClothChip key={i} cloth={cloth} />;
      })}
    </>
  );
}

function ClothChip({ cloth }: { cloth: Cloth }) {
  const today = new Date().toISOString().slice(0, 10);
  const [expanded, setExpanded] = useState(false);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tryOn } = useTryOn();

  async function plan() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/clothes/plan", { ids: [cloth.id], date });
      setDone(true);
      setExpanded(false);
    } catch (err: any) {
      setError(err.message ?? "Could not plan that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="block my-2 bg-white border border-ink/10 rounded-xl p-2">
      <span className="flex items-center gap-2">
        <img
          src={cloth.imageUrl}
          alt={cloth.name}
          className="w-11 h-11 rounded-lg object-cover bg-ink/[0.05] shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-medium truncate">{cloth.name}</span>
          <span className="block text-[11px] text-ink/65 capitalize">{cloth.category}</span>
        </span>
        {done ? (
          <span className="text-[12px] text-emerald-700 font-medium px-2">✓ Planned</span>
        ) : (
          <span className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={() => tryOn(cloth)}
              aria-label={`Try on ${cloth.name}`}
              className="tap-44 h-8 px-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-[12px] font-medium inline-flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Try
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="tap-44 h-8 px-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-[12px] font-medium"
            >
              Plan
            </button>
          </span>
        )}
      </span>
      {expanded && !done && (
        <span className="flex items-center gap-2 mt-2">
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={`Date to plan ${cloth.name}`}
            className="text-[12px] border border-ink/12 rounded-lg px-2 h-9 flex-1 min-w-0"
          />
          <button
            type="button"
            disabled={busy}
            onClick={plan}
            className="h-9 px-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-[12px] font-medium disabled:opacity-50"
          >
            {busy ? "…" : "Confirm"}
          </button>
        </span>
      )}
      {error && (
        <span role="alert" className="block text-[12px] text-coral mt-1">
          {error}
        </span>
      )}
    </span>
  );
}
