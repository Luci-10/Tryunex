// Motion preference, stored on the device. "system" defers to the OS setting;
// the other two override it in both directions. The actual effect lives in
// index.css, keyed off the data-motion attribute this module writes.
const KEY = "tryunex.motion";

export type MotionPref = "system" | "reduce" | "full";

export const MOTION_OPTIONS: { value: MotionPref; label: string; hint: string }[] = [
  { value: "system", label: "Match device", hint: "Follows your phone or computer's setting." },
  { value: "reduce", label: "Reduced", hint: "Turns off animations and transitions." },
  { value: "full", label: "Full", hint: "Keeps animations on even if your device reduces them." },
];

export function getMotionPref(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "reduce" || v === "full" || v === "system") return v;
  } catch {
    /* private mode — fall through to the default */
  }
  return "system";
}

export function applyMotionPref(pref: MotionPref) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.motion;
  else root.dataset.motion = pref;
}

export function setMotionPref(pref: MotionPref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* preference just won't survive a reload */
  }
  applyMotionPref(pref);
}
