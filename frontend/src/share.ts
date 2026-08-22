import { fetchProtectedBlob, type MediaScope } from "./media";
import { isNativeApp } from "./platform";

// Saving and sharing a generated look.
//
// The image is private: it is read through the authenticated media proxy, not
// from a URL anyone can open. That is why these take a scope and a record id
// rather than a link — there is no longer a URL worth handing to the browser,
// and the old "open in a new tab" fallback would just 401.
//
// Saving differs by platform, and getting this wrong is invisible. An <a
// download> works in a browser and does nothing at all in a WebView: the tap
// is swallowed, no file appears, and the old code reported success regardless,
// so the app cheerfully said "Saved" while the photo library stayed empty.
// Inside the app the save therefore goes through the OS photo library, and
// every path now reports what actually happened.

export type ShareOutcome =
  | { ok: true; via: "share" | "download" | "gallery" | "newtab" | "clipboard" }
  | { ok: false; cancelled: true }
  | { ok: false; message: string };

function filenameFor(date = new Date()) {
  return `tryunex-look-${date.toISOString().slice(0, 10)}.jpg`;
}

/** Fetches the image as a File through the authenticated proxy. */
async function asFile(scope: MediaScope, id: string, name: string): Promise<File | null> {
  try {
    const blob = await fetchProtectedBlob(scope, id);
    return new File([blob], name, { type: blob.type || "image/jpeg" });
  } catch {
    return null;
  }
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image"));
    reader.readAsDataURL(blob);
  });
}

/** The OS share sheet, where it can take a file. Never falls back on its own. */
async function shareViaSheet(file: File): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) {
    return { ok: false, message: "Sharing isn't available here." };
  }
  try {
    await nav.share({ files: [file], title: "My TryUnex look" });
    return { ok: true, via: "share" };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, cancelled: true };
    return { ok: false, message: "Couldn't open the share sheet." };
  }
}

/** Browser save. Works in a real browser; does nothing inside a WebView. */
function saveViaAnchor(file: File): ShareOutcome {
  const objectUrl = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a delay so the download has taken its reference.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  return { ok: true, via: "download" };
}

/**
 * Writes the image into the device photo library.
 *
 * The plugin accepts a data URI directly, so there is no temporary file to
 * write and clean up. On iOS 14+ this asks for add-only photo permission the
 * first time, which is why Info.plist carries NSPhotoLibraryAddUsageDescription.
 */
async function saveToPhotoLibrary(file: File): Promise<ShareOutcome> {
  const dataUrl = await toDataUrl(file);
  const { Media } = await import("@capacitor-community/media");
  await Media.savePhoto({ path: dataUrl });
  return { ok: true, via: "gallery" };
}

export async function downloadLook(scope: MediaScope, id: string): Promise<ShareOutcome> {
  const file = await asFile(scope, id, filenameFor());
  if (!file) return { ok: false, message: "Couldn't fetch that image. Try again in a moment." };

  if (!isNativeApp()) return saveViaAnchor(file);

  try {
    return await saveToPhotoLibrary(file);
  } catch (err: any) {
    // Denied permission, or a platform that would not take it. The share sheet
    // still gets the image out, with "Save Image" one tap away — but say so
    // rather than claiming the save happened.
    const viaSheet = await shareViaSheet(file);
    if (viaSheet.ok || "cancelled" in viaSheet) return viaSheet;
    const denied = /permission|denied|authoriz/i.test(String(err?.message ?? ""));
    return {
      ok: false,
      message: denied
        ? "TryUnex needs permission to add photos. Turn it on in Settings, then try again."
        : "Couldn't save that image to your photos.",
    };
  }
}

export async function shareLook(scope: MediaScope, id: string): Promise<ShareOutcome> {
  const file = await asFile(scope, id, filenameFor());
  if (!file) return { ok: false, message: "Couldn't fetch that image. Try again in a moment." };

  const viaSheet = await shareViaSheet(file);
  if (viaSheet.ok || "cancelled" in viaSheet) return viaSheet;

  // No share sheet: saving is the useful thing to do instead.
  return isNativeApp() ? saveToPhotoLibrary(file).catch(() => viaSheet) : saveViaAnchor(file);
}
