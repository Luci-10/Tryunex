import { useEffect, useState } from "react";
import { API_BASE } from "../../api";

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

    async function load() {
      try {
        const res = await fetch(src, { credentials: "include" });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: ${body}`);
        }

        const blob = await res.blob();
        if (!active) return;

        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
        setFailed(false);
      } catch (err) {
        if (!active) return;
        console.error(`[ProtectedPhoto] fetch failed for ${scope} ${id}:`, err);
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
