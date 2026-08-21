import { fetchProtectedBlob, type MediaScope } from "./media";

// Saving and sharing a generated look.
//
// The image is private: it is read through the authenticated media proxy, not
// from a URL anyone can open. That is why these take a scope and a record id
// rather than a link — there is no longer a URL worth handing to the browser,
// and the old "open in a new tab" fallback would just 401.

export type ShareOutcome =
  | { ok: true; via: "share" | "download" | "newtab" | "clipboard" }
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

export async function downloadLook(scope: MediaScope, id: string): Promise<ShareOutcome> {
  const name = filenameFor();
  const file = await asFile(scope, id, name);
  if (!file) return { ok: false, message: "Couldn't fetch that image. Try again in a moment." };

  const objectUrl = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a delay so the download has taken its reference.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  return { ok: true, via: "download" };
}

export async function shareLook(scope: MediaScope, id: string): Promise<ShareOutcome> {
  const name = filenameFor();
  const file = await asFile(scope, id, name);
  if (!file) return { ok: false, message: "Couldn't fetch that image. Try again in a moment." };

  // Native share, where the OS sheet can take a file.
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "My TryUnex look" });
      return { ok: true, via: "share" };
    } catch (err: any) {
      if (err?.name === "AbortError") return { ok: false, cancelled: true };
      // Fall through to saving instead.
    }
  }

  // No share sheet, or it refused the file: saving is the useful fallback.
  return downloadLook(scope, id);
}
