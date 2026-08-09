// Shared browser-side upload helpers. Uploads go straight to R2 through a
// presigned PUT — the API only hands out the URL and records the result — so
// resizing here is what keeps uploads fast on a phone connection.

/**
 * Downscale to `maxSide` and re-encode as JPEG before upload. 800px is plenty
 * for the wardrobe grid (cards render 200–400px wide); the try-on selfie gets
 * more headroom because Gemini works from it.
 */
export async function resizeImage(file: File, maxSide = 800, quality = 0.78): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("That file doesn't look like an image we can read"));
    });

    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported on this device");
    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** PUT with real progress — fetch() can't report upload progress, XHR can. */
export function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (HTTP ${xhr.status}) — check your connection`));
    xhr.onerror = () => reject(new Error("Network dropped during upload"));
    xhr.send(body);
  });
}
