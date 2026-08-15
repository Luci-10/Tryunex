import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Cloth } from "./api";
import { useAuth } from "./auth";
import { useToast } from "./components/ui/Toast";

/** Gemini composites at most five garments per look. */
export const MAX_OUTFIT_ITEMS = 5;

export type Slot = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory" | "other";

const SLOTS: Slot[] = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

export function slotOf(cloth: Cloth): Slot {
  const c = (cloth.category ?? "").toLowerCase();
  return (SLOTS as string[]).includes(c) ? (c as Slot) : "other";
}

export const SLOT_LABEL: Record<Slot, string> = {
  top: "Top",
  bottom: "Bottom",
  dress: "Dress",
  outerwear: "Outerwear",
  shoes: "Shoes",
  accessory: "Accessory",
  other: "Other",
};

/**
 * What happens when a garment is tapped. Nothing is ever removed silently —
 * anything that would displace an existing piece comes back as `needs-confirm`
 * for the UI to put to the user.
 */
export type AddOutcome =
  | { status: "added" }
  | { status: "removed" }
  | { status: "blocked"; message: string }
  | {
      status: "needs-confirm";
      kind: "replace" | "layer";
      /** Pieces that would leave the look. Empty for a layering confirm. */
      removes: Cloth[];
      message: string;
    };

type TryonState = {
  selection: Cloth[];
  /** True while a generation request is in flight — edits are locked. */
  locked: boolean;
  setLocked: (v: boolean) => void;

  /** Evaluates the rules. Does not mutate when confirmation is required. */
  evaluate: (cloth: Cloth) => AddOutcome;
  /** Applies a tap, resolving toggles and un-conflicted adds immediately. */
  select: (cloth: Cloth) => AddOutcome;
  /** Applies an outcome the user has confirmed. */
  commit: (cloth: Cloth, removes: Cloth[]) => void;
  remove: (clothId: string) => void;
  clear: () => void;
  /** Replaces the whole look at once — used by a complete outfit suggestion. */
  setLook: (clothes: Cloth[]) => void;
  isSelected: (clothId: string) => boolean;

  /** Adds from anywhere else in the app (wardrobe card, chat, detail sheet). */
  tryOn: (cloth: Cloth) => void;
};

const Ctx = createContext<TryonState | null>(null);

const storageKey = (userId: string) => `tryunex.look.${userId}`;

function load(userId: string): Cloth[] {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === "string") : [];
  } catch {
    return [];
  }
}

export function TryOnProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selection, setSelection] = useState<Cloth[]>([]);
  const [locked, setLocked] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  // Selection survives navigation and reloads for the session, and is scoped
  // to the signed-in user so it can never leak across accounts.
  useEffect(() => {
    if (!user) {
      hydratedFor.current = null;
      setSelection([]);
      return;
    }
    if (hydratedFor.current === user.id) return;
    hydratedFor.current = user.id;
    setSelection(load(user.id));
  }, [user]);

  useEffect(() => {
    if (!user || hydratedFor.current !== user.id) return;
    try {
      sessionStorage.setItem(storageKey(user.id), JSON.stringify(selection));
    } catch {
      /* private mode — selection just won't survive a reload */
    }
  }, [selection, user]);

  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const evaluate = useCallback((cloth: Cloth): AddOutcome => {
    const current = selectionRef.current;
    if (current.some((c) => c.id === cloth.id)) return { status: "removed" };

    const slot = slotOf(cloth);
    const inSlot = (s: Slot) => current.filter((c) => slotOf(c) === s);

    const dresses = inSlot("dress");
    const bottoms = inSlot("bottom");
    const tops = inSlot("top");

    // A dress is a whole outfit: it takes the place of top and bottom.
    if (slot === "dress") {
      const removes = [...dresses, ...bottoms, ...tops];
      if (removes.length > 0) {
        return {
          status: "needs-confirm",
          kind: "replace",
          removes,
          message: "A dress replaces your top and bottom. Swap them out?",
        };
      }
    }

    if ((slot === "top" || slot === "bottom") && dresses.length > 0) {
      return {
        status: "needs-confirm",
        kind: "replace",
        removes: dresses,
        message: `${dresses[0].name} is a dress — it covers this already. Replace it?`,
      };
    }

    if (slot === "bottom" && bottoms.length > 0) {
      return {
        status: "needs-confirm",
        kind: "replace",
        removes: bottoms,
        message: `Replace ${bottoms[0].name} with ${cloth.name}?`,
      };
    }

    // One top is the norm; a second is layering, and the user says so.
    if (slot === "top") {
      if (tops.length === 1) {
        return {
          status: "needs-confirm",
          kind: "layer",
          removes: [],
          message: `Layer ${cloth.name} over ${tops[0].name}?`,
        };
      }
      if (tops.length >= 2) {
        return {
          status: "needs-confirm",
          kind: "replace",
          removes: [tops[0]],
          message: `That's two layers already. Replace ${tops[0].name}?`,
        };
      }
    }

    for (const single of ["outerwear", "shoes"] as Slot[]) {
      if (slot === single) {
        const existing = inSlot(single);
        if (existing.length > 0) {
          return {
            status: "needs-confirm",
            kind: "replace",
            removes: existing,
            message: `Replace ${existing[0].name} with ${cloth.name}?`,
          };
        }
      }
    }

    // "Other" is a catch-all, so it gets a ceiling rather than a free pass.
    if (slot === "other") {
      const others = inSlot("other");
      if (others.length >= 2) {
        return {
          status: "needs-confirm",
          kind: "replace",
          removes: [others[0]],
          message: `Replace ${others[0].name} with ${cloth.name}?`,
        };
      }
    }

    if (current.length >= MAX_OUTFIT_ITEMS) {
      return {
        status: "blocked",
        message: `A look holds ${MAX_OUTFIT_ITEMS} pieces. Remove one first.`,
      };
    }

    return { status: "added" };
  }, []);

  const commit = useCallback((cloth: Cloth, removes: Cloth[]) => {
    setSelection((prev) => {
      const ids = new Set(removes.map((r) => r.id));
      const kept = prev.filter((c) => !ids.has(c.id));
      if (kept.some((c) => c.id === cloth.id)) return kept;
      return [...kept, cloth].slice(0, MAX_OUTFIT_ITEMS);
    });
  }, []);

  const remove = useCallback((clothId: string) => {
    setSelection((prev) => prev.filter((c) => c.id !== clothId));
  }, []);

  const select = useCallback(
    (cloth: Cloth): AddOutcome => {
      const outcome = evaluate(cloth);
      if (outcome.status === "removed") remove(cloth.id);
      else if (outcome.status === "added") commit(cloth, []);
      return outcome;
    },
    [evaluate, remove, commit],
  );

  const clear = useCallback(() => setSelection([]), []);

  const setLook = useCallback((clothes: Cloth[]) => {
    // A suggested outfit is complete in itself, so it supersedes whatever was
    // selected rather than merging and tripping the category rules.
    const seen = new Set<string>();
    setSelection(
      clothes.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))).slice(0, MAX_OUTFIT_ITEMS),
    );
  }, []);

  const isSelected = useCallback(
    (clothId: string) => selectionRef.current.some((c) => c.id === clothId),
    [],
  );

  // Entry point used by the wardrobe cards, chat and detail sheet. Those can't
  // host a confirmation dialog, so a conflicting tap explains itself in a
  // toast and leaves the look untouched.
  const tryOn = useCallback(
    (cloth: Cloth) => {
      const outcome = evaluate(cloth);
      if (outcome.status === "removed") {
        toast(`${cloth.name} is already in your look`);
        return;
      }
      if (outcome.status === "blocked") {
        toast(outcome.message, { tone: "error" });
        return;
      }
      if (outcome.status === "needs-confirm") {
        toast(`${outcome.message} Open Try-on to decide.`, { tone: "error" });
        return;
      }
      commit(cloth, []);
      toast(`${cloth.name} added to your look`, { tone: "success" });
    },
    [evaluate, commit, toast],
  );

  const value = useMemo<TryonState>(
    () => ({
      selection,
      locked,
      setLocked,
      evaluate,
      select,
      commit,
      remove,
      clear,
      setLook,
      isSelected,
      tryOn,
    }),
    [selection, locked, evaluate, select, commit, remove, clear, setLook, isSelected, tryOn],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTryOn() {
  const v = useContext(Ctx);
  if (!v) throw new Error("TryOnProvider missing");
  return v;
}
