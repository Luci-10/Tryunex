import { createContext, useContext, useState, type ReactNode } from "react";
import type { Cloth } from "./api";

type ChatState = {
  open: boolean;
  attached: Cloth | null;
  openChat: (cloth?: Cloth | null) => void;
  closeChat: () => void;
  setAttached: (c: Cloth | null) => void;
};

const Ctx = createContext<ChatState | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [attached, setAttached] = useState<Cloth | null>(null);

  return (
    <Ctx.Provider
      value={{
        open,
        attached,
        openChat: (cloth) => {
          setAttached(cloth ?? null);
          setOpen(true);
        },
        closeChat: () => setOpen(false),
        setAttached,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useChat() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ChatProvider missing");
  return v;
}
