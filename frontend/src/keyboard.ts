import { useEffect, useState } from "react";
import { isNativeApp } from "./platform";

/**
 * Whether the on-screen keyboard is up, inside the app.
 *
 * The bottom tab bar is fixed to the bottom of the viewport, and iOS shrinks
 * the web view when the keyboard appears — so the bar rides up and sits above
 * the keyboard, which reads as the page moving on its own. Hiding it while
 * typing is what the platform's own apps do, and it gives the field more room.
 *
 * Both the "will" and "did" events are used because the pair differs by
 * platform: iOS fires the "will" variants ahead of the animation, Android is
 * reliable only on "did". Listening to both means the bar goes at the earliest
 * moment either platform can tell us.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    let remove: (() => void) | undefined;

    (async () => {
      try {
        const { Keyboard } = await import("@capacitor/keyboard");
        const handles = await Promise.all([
          Keyboard.addListener("keyboardWillShow", () => setOpen(true)),
          Keyboard.addListener("keyboardDidShow", () => setOpen(true)),
          Keyboard.addListener("keyboardWillHide", () => setOpen(false)),
          Keyboard.addListener("keyboardDidHide", () => setOpen(false)),
        ]);
        // Unmounted while the plugin was loading: drop them immediately.
        if (cancelled) {
          handles.forEach((h) => h.remove());
          return;
        }
        remove = () => handles.forEach((h) => h.remove());
      } catch {
        // No keyboard plugin on this platform. The bar simply stays put,
        // which is the behaviour everywhere except the app anyway.
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return open;
}
