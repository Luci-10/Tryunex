// One-time UX gate before opening the OS photo picker. The browser doesn't
// have a separate permission API for file inputs — clicking the input IS
// the user gesture that grants access. This prompt just explains what's
// about to happen the FIRST time the user taps an upload area, then gets
// out of the way on every subsequent upload.
const KEY = "tryunex.photo-consent";

// "(pointer: coarse)" matches when the user's primary pointer is touch —
// i.e. a phone or tablet. On desktop/laptop with a mouse, it's false, and
// the explainer is just friction so we skip it there.
function isPhoneLike(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export function hasPhotoConsent(): boolean {
  // Desktop / laptop: nothing to consent to — file pickers there are
  // explicit OS dialogs, no "gallery permission" exists.
  if (!isPhoneLike()) return true;
  try {
    return localStorage.getItem(KEY) === "yes";
  } catch {
    // Private mode / storage disabled — skip the prompt rather than block uploads.
    return true;
  }
}

export function grantPhotoConsent() {
  try {
    localStorage.setItem(KEY, "yes");
  } catch {
    /* ignore */
  }
}
