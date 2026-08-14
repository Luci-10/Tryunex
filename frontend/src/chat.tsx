import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { API_BASE, type Cloth } from "./api";

export type Msg = { role: "user" | "assistant"; content: string };

export type StyleContext = {
  occasion?: string;
  mood?: string;
  date?: string;
  weather?: string;
};

// The backend accepts 40 turns; we send fewer so a long session stays cheap
// and fast. Older turns drop off the request, not the transcript.
const SEND_WINDOW = 20;

type ChatState = {
  open: boolean;
  attached: Cloth | null;
  messages: Msg[];
  streaming: string;
  busy: boolean;
  styleContext: StyleContext;

  openChat: (cloth?: Cloth | null) => void;
  closeChat: () => void;
  setAttached: (c: Cloth | null) => void;
  setStyleContext: (c: StyleContext) => void;

  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
  /** Re-run the last user turn, replacing the answer that followed it. */
  retry: () => Promise<void>;
};

const Ctx = createContext<ChatState | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [attached, setAttached] = useState<Cloth | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [styleContext, setStyleContext] = useState<StyleContext>({});

  // Lives in a ref so `stop()` can reach the in-flight request without the
  // send loop being re-created on every render.
  const abortRef = useRef<AbortController | null>(null);
  const attachedRef = useRef<Cloth | null>(null);
  const contextRef = useRef<StyleContext>({});
  attachedRef.current = attached;
  contextRef.current = styleContext;

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const run = useCallback(async (history: Msg[]) => {
    setMessages(history);
    setBusy(true);
    setStreaming("");

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-SEND_WINDOW),
          attachedClothId: attachedRef.current?.id,
          context: Object.keys(contextRef.current).length ? contextRef.current : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

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
      if (acc.trim()) setMessages([...history, { role: "assistant", content: acc }]);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // Keep whatever streamed before the user stopped it — half an answer
        // is still worth reading.
        if (acc.trim()) setMessages([...history, { role: "assistant", content: acc }]);
      } else {
        setMessages([
          ...history,
          { role: "assistant", content: `⚠️ ${err?.message ?? "Chat failed"}` },
        ]);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStreaming("");
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || abortRef.current) return;
      await run([...messages, { role: "user", content: trimmed }]);
    },
    [messages, run],
  );

  const retry = useCallback(async () => {
    if (abortRef.current) return;
    // Drop trailing assistant turns and re-ask the last question.
    let i = messages.length - 1;
    while (i >= 0 && messages[i].role === "assistant") i--;
    if (i < 0) return;
    await run(messages.slice(0, i + 1));
  }, [messages, run]);

  const clear = useCallback(() => {
    stop();
    setMessages([]);
    setStreaming("");
    setStyleContext({});
  }, [stop]);

  const value = useMemo<ChatState>(
    () => ({
      open,
      attached,
      messages,
      streaming,
      busy,
      styleContext,
      openChat: (cloth) => {
        if (cloth !== undefined) setAttached(cloth ?? null);
        setOpen(true);
      },
      closeChat: () => setOpen(false),
      setAttached,
      setStyleContext,
      send,
      stop,
      clear,
      retry,
    }),
    [open, attached, messages, streaming, busy, styleContext, send, stop, clear, retry],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ChatProvider missing");
  return v;
}
