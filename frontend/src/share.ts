// Saving and sharing a generated look.
//
// The image lives on R2 at a public URL. Reading it as a blob needs the
// bucket to answer a cross-origin GET, which we can't assume, so every path
// here degrades: blob → direct link → copy the URL. Nothing silently fails.

export type ShareOutcome =
  | { ok: true; via: "share" | "download" | "newtab" | "clipboard" }
  | { ok: false; cancelled: true }
  | { ok: false; message: string };

function filenameFor(date = new Date()) {
  return `tryunex-look-${date.toISOString().slice(0, 10)}.jpg`;
}

/** Fetches the image as a File. Returns null when CORS or the network says no. */
async function asFile(url: string, name: string): Promise<File | null> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return new File([blob], name, { type: blob.type || "image/jpeg" });
  } catch {
    return null;
  }
}

export async function downloadLook(url: string): Promise<ShareOutcome> {
  const name = filenameFor();
  const file = await asFile(url, name);

  if (file) {
    const objectUrl = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick so the download has taken the reference.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    return { ok: true, via: "download" };
  }

  // `download` is ignored cross-origin, so this opens the image rather than
  // saving it — from there the user can save it themselves.
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) return { ok: true, via: "newtab" };
  return { ok: false, message: "Couldn't open the image. Check your pop-up settings." };
}

export async function shareLook(url: string): Promise<ShareOutcome> {
  const name = filenameFor();
  const text = "My look, previewed with TryUnex";

  // Best case: the OS share sheet with the actual image attached.
  if (typeof navigator !== "undefined" && navigator.share) {
    const file = await asFile(url, name);
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My TryUnex look", text });
        return { ok: true, via: "share" };
      }
      await navigator.share({ title: "My TryUnex look", text, url });
      return { ok: true, via: "share" };
    } catch (err: any) {
      // The user closing the sheet is not an error worth reporting.
      if (err?.name === "AbortError") return { ok: false, cancelled: true };
      // Fall through to the clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, via: "clipboard" };
  } catch {
    return { ok: false, message: "Sharing isn't available here. Save the image instead." };
  }
}
