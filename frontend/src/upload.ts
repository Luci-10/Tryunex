import { isNativeApp } from "./platform";
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

/**
 * An XMLHttpRequest constructor the Capacitor bridge has not patched.
 *
 * Tries Capacitor's own saved original first, but only if it is genuinely a
 * constructor. Falls back to a detached same-origin iframe, whose window
 * carries untouched globals. Falls back again to the patched one, which is
 * better than throwing.
 */
let cachedXHR: typeof XMLHttpRequest | null = null;

function unpatchedXHR(): typeof XMLHttpRequest {
  if (cachedXHR) return cachedXHR;
  // Only the app needs this. On the web nothing patches XMLHttpRequest, and
  // that path already works — no reason to route it through an iframe.
  if (!isNativeApp()) {
    cachedXHR = XMLHttpRequest;
    return cachedXHR;
  }
  const saved = (window as any).CapacitorWebXMLHttpRequest;
  if (typeof saved === "function") {
    cachedXHR = saved as typeof XMLHttpRequest;
    return cachedXHR;
  }
  try {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    document.body.appendChild(frame);
    // The iframe stays in the document on purpose. Removing it tears down its
    // window, and the constructor taken from it stops working — which is what
    // broke the first attempt at this.
    const fromFrame = (frame.contentWindow as any)?.XMLHttpRequest;
    if (typeof fromFrame === "function") {
      cachedXHR = fromFrame as typeof XMLHttpRequest;
      return cachedXHR;
    }
  } catch {
    /* iframe unavailable — fall through */
  }
  cachedXHR = XMLHttpRequest;
  return cachedXHR;
}

/** PUT with real progress — fetch() can't report upload progress, XHR can. */
export function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // CapacitorHttp patches XMLHttpRequest, and the native bridge cannot
    // serialise a Blob body — it JSON-stringifies it, so R2 received the two
    // bytes "{}" instead of the image. The PUT targets a presigned URL and
    // needs no cookie, so it can safely skip the bridge entirely.
    //
    // Capacitor's own escape hatch is not dependable: the global exists but is
    // not always a constructor. A same-origin iframe is, because its window
    // has pristine globals that the patch never touched.
    const xhr = new (unpatchedXHR())();
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

/**
 * High-quality optimisation for the try-on person image.
 *
 * A phone camera hands us a 12–48MP original. Sending that to the provider is
 * wasteful (it bills per megapixel, rounded up) and slow on mobile data, but
 * over-compressing loses the fabric and silhouette detail the model reads. So:
 * long edge 1024 — a 768×1024 portrait is 0.79MP, just under the 1MP the model
 * recommends — at quality 0.91, aspect ratio preserved, never upscaled, never
 * cropped.
 *
 * `createImageBitmap(..., { imageOrientation: "from-image" })` applies EXIF
 * rotation, so a photo taken in portrait doesn't arrive sideways. Older
 * browsers fall back to the <img> path, which browsers already auto-orient.
 */
/**
 * The sizing decision, split out so it can be tested without a browser:
 * scale down to `longEdge`, never up, preserving aspect ratio exactly.
 */
export function targetSize(
  width: number,
  height: number,
  longEdge = 1024,
): { w: number; h: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

export async function optimizeForTryOn(
  file: File,
  longEdge = 1024,
  quality = 0.91,
): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("That file doesn't look like an image we can read"));
      });
      source = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const { w, h } = targetSize(width, height, longEdge);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported on this device");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  if ("close" in source) (source as ImageBitmap).close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))),
      "image/jpeg",
      quality,
    );
  });
}
