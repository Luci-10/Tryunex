import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Cloth } from "./api";
import { useToast } from "./components/ui/Toast";

export type Outfit = { id: string; clothes: Cloth[] };

/** Gemini composites at most five garments per look. */
export const MAX_OUTFIT_ITEMS = 5;

type TryonState = {
  outfits: Outfit[];
  /** The outfit the studio and the "Try" buttons act on. */
  active: Outfit | null;
  newOutfit: () => string;
  deleteOutfit: (outfitId: string) => void;
  addCloth: (outfitId: string, cloth: Cloth) => void;
  removeCloth: (outfitId: string, clothId: string) => void;
  clearAll: () => void;
  // Adds the cloth to the active outfit (or starts one) and toasts. Does NOT
  // navigate — the user stays put and visits /tryon when ready.
  tryOn: (cloth: Cloth) => void;
};

const Ctx = createContext<TryonState | null>(null);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function TryOnProvider({ children }: { children: ReactNode }) {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const { toast } = useToast();

  const active = outfits.length > 0 ? outfits[outfits.length - 1] : null;

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
      prev.map((o) => {
        if (o.id !== outfitId) return o;
        if (o.clothes.some((c) => c.id === cloth.id)) return o;
        if (o.clothes.length >= MAX_OUTFIT_ITEMS) return o;
        return { ...o, clothes: [...o.clothes, cloth] };
      }),
    );
  }

  function removeCloth(outfitId: string, clothId: string) {
    setOutfits((prev) =>
      prev.map((o) =>
        o.id === outfitId ? { ...o, clothes: o.clothes.filter((c) => c.id !== clothId) } : o,
      ),
    );
  }

  function clearAll() {
    setOutfits([]);
  }

  function tryOn(cloth: Cloth) {
    let outcome: "duplicate" | "full" | "appended" | "new" = "appended";
    setOutfits((prev) => {
      if (prev.length === 0) {
        outcome = "new";
        return [{ id: uid(), clothes: [cloth] }];
      }
      const last = prev[prev.length - 1];
      if (last.clothes.some((c) => c.id === cloth.id)) {
        outcome = "duplicate";
        return prev;
      }
      if (last.clothes.length >= MAX_OUTFIT_ITEMS) {
        outcome = "full";
        return prev;
      }
      outcome = last.clothes.length === 0 ? "new" : "appended";
      return [...prev.slice(0, -1), { ...last, clothes: [...last.clothes, cloth] }];
    });
    // State isn't readable synchronously after setState, so branch on `outcome`.
    queueMicrotask(() => {
      if (outcome === "duplicate") toast(`${cloth.name} is already in your look`);
      else if (outcome === "full")
        toast(`A look holds ${MAX_OUTFIT_ITEMS} pieces — remove one first`, { tone: "error" });
      else if (outcome === "new") toast(`Started a look with ${cloth.name}`, { tone: "success" });
      else toast(`Added ${cloth.name} to your look`, { tone: "success" });
    });
  }

  const value = useMemo(
    () => ({ outfits, active, newOutfit, deleteOutfit, addCloth, removeCloth, clearAll, tryOn }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outfits, active],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTryOn() {
  const v = useContext(Ctx);
  if (!v) throw new Error("TryOnProvider missing");
  return v;
}
