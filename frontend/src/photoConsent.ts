// One-time UX gate before opening the OS photo picker. The browser doesn't
// have a separate permission API for file inputs — clicking the input IS
// the user gesture that grants access. This prompt just explains what's
// about to happen the FIRST time the user taps an upload area, then gets
// out of the way on every subsequent upload.
const KEY = "tryunex.photo-consent";

export function hasPhotoConsent(): boolean {
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
