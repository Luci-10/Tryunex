import { useEffect, useState } from "react";
import { API_BASE } from "../../api";
import { isNativeApp } from "../../platform";

export type MediaScope = "cloth" | "selfie" | "tryon" | "listing";

/**
 * An image component that handles protected media in the Capacitor app.
 */
export default function ProtectedPhoto({
  scope,
  id,
  alt,
  className,
  loading = "lazy",
  fallback,
}: {
  scope: MediaScope;
  id: string;
  src?: string; // accepted but ignored in favor of the protected proxy path
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  fallback?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let currentUrl: string | null = null;
    const src = `${API_BASE}/media/proxy/${scope}/${id}`;

    /**
     * XHR, not fetch, and deliberately.
     *
     * capacitor.config enables CapacitorHttp, which patches window.fetch to go
     * through the native layer. That is what makes cookies work on the
     * cross-origin call from https://localhost to the API — but the bridge
     * serialises responses as text, so res.blob() hands back a blob built from
     * a mangled string. The fetch "succeeds", the object URL looks valid, and
     * the <img> then fails to decode it. That is app-only, which is why the
     * website was always fine.
     *
     * CapacitorHttp does not intercept XHR, and responseType="blob" keeps the
     * bytes intact. It is also what upload.ts already uses for R2 uploads, the
     * one binary transfer that has always worked in the app.
     */
    /**
     * Two paths, because the two platforms have opposite constraints.
     *
     * On the web, plain fetch: same-origin, cookie travels, blob is a blob.
     *
     * In the app, CapacitorHttp patches both fetch and XHR. That patching is
     * what makes the session cookie survive the cross-origin call to the API —
     * so bypassing it would break auth — but the bridge serialises responses
     * as text, which corrupts binary. Asking the plugin for base64 explicitly
     * works with the bridge instead of against it.
     */
    async function load() {
      try {
        const url = `${API_BASE}/media/proxy/${scope}/${id}`;
        let blob: Blob;

        if (isNativeApp()) {
          const { CapacitorHttp } = await import("@capacitor/core");
          const res = await CapacitorHttp.get({ url, responseType: "blob" });
          if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
          const b64 = typeof res.data === "string" ? res.data : "";
          if (!b64) throw new Error("empty response");
          const type = String(res.headers?.["content-type"] ?? "image/jpeg").split(";")[0];
          blob = await (await fetch(`data:${type};base64,${b64}`)).blob();
        } else {
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          blob = await res.blob();
        }

        if (!active) return;
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
        setFailed(false);
      } catch (err) {
        if (!active) return;
        console.error(`[ProtectedPhoto] ${scope} ${id}:`, err);
        setFailed(true);
      }
    }

    load();

    return () => {
      active = false;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [scope, id]);

  const displaySrc = failed ? fallback : (objectUrl ?? undefined);

  if (!displaySrc) {
    return <div className={`${className} bg-ink/[0.04] shimmer`} />;
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        console.error(`[ProtectedPhoto] img render failed for ${scope} ${id}`);
        setFailed(true);
      }}
    />
  );
}
