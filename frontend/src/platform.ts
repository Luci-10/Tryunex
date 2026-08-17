import { Capacitor } from "@capacitor/core";

/**
 * Whether we are running inside the installed Android/iOS app.
 *
 * Evaluated per call, not once at import. This used to be a module-level
 * `const`, which meant that if the Capacitor bridge was not ready at the
 * moment this module first loaded, the answer was frozen to `false` for the
 * whole session — and native-only affordances silently disappeared.
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function platformName(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

/** Executes a function only on the native app (Android/iOS). */
export function runInApp(fn: () => void) {
  if (isNativeApp()) fn();
}

/** Executes a function only on the web. */
export function runOnWeb(fn: () => void) {
  if (!isNativeApp()) fn();
}
