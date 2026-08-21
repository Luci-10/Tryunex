import { useEffect, useState } from "react";
import { fetchProtectedBlob, type MediaScope } from "../../media";

export type { MediaScope };

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
        const blob = await fetchProtectedBlob(scope, id);
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
