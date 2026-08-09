import { useEffect, useRef } from "react";
import IconButton from "./ui/IconButton";
import { Close } from "./ui/icons";

/**
 * Full-screen image view. Escape or the close button dismisses it; tapping
 * the backdrop does too. Focus moves to the close button on open so keyboard
 * users can always get out.
 */
export default function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!src) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [src, onClose]);

  if (!src) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `${alt} — full size` : "Image, full size"}
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-ink/95 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
    >
      <img
        src={src}
        alt={alt ?? ""}
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
      <IconButton
        ref={closeRef}
        label="Close full-size image"
        tone="onImage"
        onClick={onClose}
        className="absolute top-4 right-4 !w-11 !h-11"
      >
        <Close className="w-5 h-5" />
      </IconButton>
    </div>
  );
}
