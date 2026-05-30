import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Cloth } from "./api";

export type Outfit = { id: string; clothes: Cloth[] };

// The Try-on page can hold multiple pending outfits in parallel — each is
// an independent group of clothes the user wants to compose and try on.
// "Try" from anywhere appends a cloth to the most recent (active) outfit,
// creating one if needed. Users build subsequent outfits by hitting
// "+ New outfit" on the page.
type TryonState = {
  outfits: Outfit[];
  // Lifecycle
  newOutfit: () => string;
  deleteOutfit: (outfitId: string) => void;
  // Items
  addCloth: (outfitId: string, cloth: Cloth) => void;
  removeCloth: (outfitId: string, clothId: string) => void;
  // Cloth-card entry point — adds to the latest outfit (or starts a new
  // one if there are no outfits yet) and navigates to /tryon.
  tryOn: (cloth: Cloth) => void;
};

const Ctx = createContext<TryonState | null>(null);

function uid() {
  // Small client-side id — only used to key React lists, never sent to the server.
  return Math.random().toString(36).slice(2, 10);
}

export function TryOnProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [outfits, setOutfits] = useState<Outfit[]>([]);

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
    setOutfits((prev) => {
      if (prev.length === 0) {
        return [{ id: uid(), clothes: [cloth] }];
      }
      // Add to the last (most recently created) outfit, skipping dupes.
      const last = prev[prev.length - 1];
      if (last.clothes.some((c) => c.id === cloth.id)) return prev;
      return [...prev.slice(0, -1), { ...last, clothes: [...last.clothes, cloth] }];
    });
    nav("/tryon");
  }

  return (
    <Ctx.Provider value={{ outfits, newOutfit, deleteOutfit, addCloth, removeCloth, tryOn }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTryOn() {
  const v = useContext(Ctx);
  if (!v) throw new Error("TryOnProvider missing");
  return v;
}
