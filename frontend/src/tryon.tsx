import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Cloth } from "./api";

export type Outfit = { id: string; clothes: Cloth[] };

type TryonState = {
  outfits: Outfit[];
  newOutfit: () => string;
  deleteOutfit: (outfitId: string) => void;
  addCloth: (outfitId: string, cloth: Cloth) => void;
  removeCloth: (outfitId: string, clothId: string) => void;
  // Adds the cloth to the latest outfit (or starts a new one) and shows
  // a toast confirming. Does NOT navigate — user stays on whatever page
  // they were on, and visits /tryon when ready.
  tryOn: (cloth: Cloth) => void;
};

const Ctx = createContext<TryonState | null>(null);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function TryOnProvider({ children }: { children: ReactNode }) {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  function newOutfit() {
    const id = uid();
    setOutfits((prev) => [...prev, { id, clothes: [] }]);
    return id;
  }

  function deleteOutfit(outfitId: string) {
    setOutfits((prev) => prev.filter((o) => o.id !== outfitId));
  }

  function addCloth(outfitId: string, cloth: Cloth) {
    setOutfits((prev) =>
      prev.map((o) =>
        o.id === outfitId && !o.clothes.some((c) => c.id === cloth.id)
          ? { ...o, clothes: [...o.clothes, cloth] }
          : o,
      ),
    );
  }

  function removeCloth(outfitId: string, clothId: string) {
    setOutfits((prev) =>
      prev.map((o) =>
        o.id === outfitId ? { ...o, clothes: o.clothes.filter((c) => c.id !== clothId) } : o,
      ),
    );
  }

  function tryOn(cloth: Cloth) {
    let action: "duplicate" | "appended" | "new" = "appended";
    setOutfits((prev) => {
      if (prev.length === 0) {
        action = "new";
        return [{ id: uid(), clothes: [cloth] }];
      }
      const last = prev[prev.length - 1];
      if (last.clothes.some((c) => c.id === cloth.id)) {
        action = "duplicate";
        return prev;
      }
      action = last.clothes.length === 0 ? "new" : "appended";
      return [...prev.slice(0, -1), { ...last, clothes: [...last.clothes, cloth] }];
    });
    // Toast can't read state synchronously after setState, so derive from `action`.
    queueMicrotask(() => {
      if (action === "duplicate") flash(`${cloth.name} is already in your outfit`);
      else if (action === "new") flash(`Started a new outfit with ${cloth.name}`);
      else flash(`Added ${cloth.name} to the outfit`);
    });
  }

  return (
    <Ctx.Provider value={{ outfits, newOutfit, deleteOutfit, addCloth, removeCloth, tryOn }}>
      {children}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg pointer-events-auto">
            {toast}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useTryOn() {
  const v = useContext(Ctx);
  if (!v) throw new Error("TryOnProvider missing");
  return v;
}
