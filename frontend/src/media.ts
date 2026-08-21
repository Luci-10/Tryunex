import { API_BASE } from "./api";
import { isNativeApp } from "./platform";

export type MediaScope = "cloth" | "selfie" | "tryon" | "listing";

/**
 * Fetches a private image as a Blob.
 *
 * One place, because three features need the same bytes: rendering
 * (ProtectedPhoto), zooming, and saving or sharing. They used to fetch the R2
 * URL directly, which stopped working when the bucket went private — a public
 * URL no longer resolves, and `credentials: "omit"` would not authenticate
 * even against the proxy.
 *
 * The two platforms need different transports. On the web a plain fetch with
 * credentials works. In the Capacitor app, CapacitorHttp patches fetch to go
 * through the native layer — which is what keeps the session cookie on the
 * cross-origin call — but that layer serialises responses as text and corrupts
 * binary, so the app asks for base64 explicitly and decodes it.
 */
export async function fetchProtectedBlob(scope: MediaScope, id: string): Promise<Blob> {
  const url = `${API_BASE}/media/proxy/${scope}/${id}`;

  if (isNativeApp()) {
    const { CapacitorHttp } = await import("@capacitor/core");
    const res = await CapacitorHttp.get({ url, responseType: "blob" });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    const b64 = typeof res.data === "string" ? res.data : "";
    if (!b64) throw new Error("empty response");
    const type = String(res.headers?.["content-type"] ?? "image/jpeg").split(";")[0];
    return await (await fetch(`data:${type};base64,${b64}`)).blob();
  }

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.size) throw new Error("empty image");
  return blob;
}

/** An object URL for a private image. Callers must revoke it when done. */
export async function protectedObjectUrl(scope: MediaScope, id: string): Promise<string> {
  return URL.createObjectURL(await fetchProtectedBlob(scope, id));
}
