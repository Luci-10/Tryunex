import { useEffect, useState } from "react";
import { isNativeApp } from "./platform";

/**
 * How much of the screen the on-screen keyboard is covering, in pixels.
 * Zero when it is down, and always zero outside the app.
 *
 * Capacitor's default is to resize the whole web view when the keyboard
 * appears. That changes what `vh` and `height: 100%` mean, so the entire
 * layout is recalculated twice per keystroke session — and iOS does not
 * reliably restore the old size afterwards, which leaves the page taller than
 * the screen and everything fixed to the bottom sitting in the wrong place.
 *
 * The app therefore turns resizing off (see capacitor.config.ts) and moves the
 * few things that genuinely need to clear the keyboard by this much instead.
 * Nothing else in the layout notices the keyboard at all.
 */
/**
 * With the web view no longer resizing, a field partway down the page can end
 * up behind the keyboard — the platform would normally have scrolled it into
 * view as a side effect of shrinking. Do it explicitly instead.
 *
 * Only in-flow fields need this. Anything fixed to the bottom is offset by the
 * keyboard height directly and is already clear of it.
 */
function bringFocusedFieldIntoView() {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !el.matches?.("input, textarea, [contenteditable]")) return;
  if (el.closest("[data-keyboard-offset]")) return;
  // After the frame in which the keyboard height lands, so the scroll lands
  // against the final layout rather than the one being replaced.
  requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: "smooth" }));
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    let remove: (() => void) | undefined;

    (async () => {
      try {
        const { Keyboard } = await import("@capacitor/keyboard");
        const handles = await Promise.all([
          // iOS reports "will" ahead of the animation; Android is only
          // dependable on "did". Listening to both means we react at the
          // earliest moment either platform can tell us.
          Keyboard.addListener("keyboardWillShow", (i) => {
            setInset(i.keyboardHeight);
            bringFocusedFieldIntoView();
          }),
          Keyboard.addListener("keyboardDidShow", (i) => {
            setInset(i.keyboardHeight);
            bringFocusedFieldIntoView();
          }),
          Keyboard.addListener("keyboardWillHide", () => setInset(0)),
          Keyboard.addListener("keyboardDidHide", () => setInset(0)),
        ]);
        if (cancelled) {
          handles.forEach((h) => h.remove());
          return;
        }
        remove = () => handles.forEach((h) => h.remove());
      } catch {
        // No keyboard plugin here: the layout simply never reacts, which is
        // the correct behaviour everywhere except the app.
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return inset;
}

/** Convenience for the places that only care whether it is up. */
export function useKeyboardOpen(): boolean {
  return useKeyboardInset() > 0;
}
