import { useEffect, useRef, useState } from "react";
import { useChat } from "../chat";
import { useTryOn } from "../tryon";
import { api, type Cloth } from "../api";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_CHIPS = [
  "What should I wear today?",
  "I have an event tonight",
  "What's in my wardrobe?",
];

// Matches `[cloth: <id>]` tokens emitted by the chat model (see system prompt
// in backend/src/routes/chat.ts). Kept tolerant of whitespace so the
// occasional `[cloth:<id>]` or `[cloth:  <id>  ]` still resolves.
const CLOTH_TOKEN = /\[cloth:\s*([^\]\s]+)\s*\]/g;

export default function ChatPanel() {
  const { open, attached, closeChat, setAttached } = useChat();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<string>("");
  const [wardrobe, setWardrobe] = useState<Map<string, Cloth>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the user's wardrobe once per panel open so we can resolve
  // [cloth: <id>] tokens to a name + image without an extra fetch per turn.
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
    if (!open) setAttached(null);
  }, [open, setAttached]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setStreaming("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, attachedClothId: attached?.id }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
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
          const lines = frame.split("\n");
          let evName = "message";
          let data = "";
          for (const line of lines) {
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
    <div className="fixed inset-x-0 bottom-0 z-40 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[400px] sm:max-h-[80vh]">
      <div className="bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl flex flex-col h-[75vh] sm:h-[70vh]">
        <header className="flex items-center gap-2 px-4 py-3 border-b">
          <div className="flex-1">
            <div className="font-semibold text-sm">Ask TryUnex</div>
            {attached && (
              <div className="text-xs text-brand-700 mt-0.5">Asking about: {attached.name}</div>
            )}
          </div>
          <button
            onClick={closeChat}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-800 text-xl leading-none w-8 h-8"
          >
            ×
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !streaming && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Hi 👋 I can suggest outfits, help plan your week, or answer questions about your wardrobe.
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_CHIPS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 px-3 py-1.5 rounded-full"
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
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t p-3 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            disabled={busy}
            className="flex-1 border rounded-full px-4 py-2 text-sm disabled:opacity-60"
          />
          <button
            disabled={busy || !input.trim()}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 rounded-full disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
          </button>
        </form>
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
  // User messages are plain text. Assistant messages may contain [cloth: id]
  // tokens which we replace with inline cloth cards.
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
          isUser ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-900"
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
        if (!cloth) return <span key={i} className="text-gray-400 italic">[unknown]</span>;
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
      setError(err.message ?? "Could not plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="block my-2 bg-white border rounded-xl p-2 not-prose">
      <span className="flex items-center gap-2">
        <img
          src={cloth.imageUrl}
          alt={cloth.name}
          className="w-12 h-12 rounded-lg object-cover bg-gray-100 flex-shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate text-gray-900">{cloth.name}</span>
          <span className="block text-xs text-gray-500 capitalize">{cloth.category}</span>
        </span>
        {done ? (
          <span className="text-xs text-emerald-700 font-medium px-2">✓ Planned</span>
        ) : (
          <span className="flex gap-1">
            <button
              onClick={() => tryOn(cloth)}
              className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 font-medium px-2 py-1 rounded-md"
              title="Try on"
            >
              👤
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 font-medium px-2.5 py-1 rounded-md"
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
            className="text-xs border rounded px-2 py-1 flex-1"
          />
          <button
            disabled={busy}
            onClick={plan}
            className="text-xs bg-brand-600 hover:bg-brand-700 text-white font-medium px-3 py-1 rounded disabled:opacity-50"
          >
            {busy ? "…" : "Confirm"}
          </button>
        </span>
      )}
      {error && <span className="block text-xs text-red-600 mt-1">{error}</span>}
    </span>
  );
}
