import { useRef, useState } from "react";
import { api, type Cloth } from "../api";
import { useAuth } from "../auth";
import Modal from "./Modal";
import PhotoAccessPrompt from "./PhotoAccessPrompt";
import { hasPhotoConsent, grantPhotoConsent } from "../photoConsent";

function putWithProgress(url: string, body: Blob, contentType: string, onProgress: (pct: number) => void): Promise<void> {
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
        : reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

// 800px is plenty for the wardrobe grid (cards render ~200-400px wide) and
// keeps uploads small for users on slower connections — Vercel Blob lives in
// the US, so a smaller payload meaningfully cuts upload time from India.
// 800px is plenty for the wardrobe grid (cards render ~200-400px wide) and
// keeps uploads small for users on slower connections.
async function resizeImage(file: File, maxSide = 800, quality = 0.78): Promise<Blob> {
  const imageUrl = URL.createObjectURL(file);
  const img = new Image();
  img.src = imageUrl;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
  });

  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(imageUrl);
    throw new Error("Canvas not supported");
  }

  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(imageUrl);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      quality,
    );
  });
}

export default function AddClothModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (c: Cloth) => void;
}) {
  const { user } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askPhoto, setAskPhoto] = useState(false);

  // Intercept the label click on first-ever upload to show the explainer.
  function handleUploadAreaClick(e: React.MouseEvent) {
    if (!hasPhotoConsent()) {
      e.preventDefault();
      setAskPhoto(true);
    }
  }
  function continuePhotoAccess() {
    grantPhotoConsent();
    setAskPhoto(false);
    // Defer click so the modal can unmount cleanly first.
    setTimeout(() => fileRef.current?.click(), 50);
  }

  function close() {
    formRef.current?.reset();
    setPreview(null);
    setProgress(null);
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!user) {
      setError("Not signed in");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const file = fd.get("image");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a photo");
      return;
    }
    const name = String(fd.get("name") ?? "").trim() || "Untitled";
    const category = String(fd.get("category") ?? "other");

    setBusy(true);
    try {
      const resized = await resizeImage(file);
      const { uploadUrl, publicUrl } = await api.post<{ uploadUrl: string; publicUrl: string }>(
        "/clothes/upload-url",
        { contentType: "image/jpeg", ext: "jpg" },
      );
      await putWithProgress(uploadUrl, resized, "image/jpeg", setProgress);
      setProgress(null);
      const r = await api.post<{ cloth: Cloth }>("/clothes", {
        imageUrl: publicUrl,
        name,
        category,
      });
      onAdded(r.cloth);
      close();
    } catch (err: any) {
      console.error("[upload] failed", err);
      setError(err.message ?? "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add a piece">
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <label
          onClick={handleUploadAreaClick}
          className="relative aspect-square bg-brand-50 rounded-xl border-2 border-dashed border-brand-200 flex items-center justify-center cursor-pointer overflow-hidden block"
        >
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-brand-600 text-sm text-center px-4">Tap to choose a photo<br /><span className="text-xs text-gray-500">(or take one with your camera)</span></span>
          )}
          {/* No `capture` attr — phone OS shows the picker with both
              "Take photo" and "Choose from gallery". With capture set,
              gallery is skipped entirely. */}
          <input
            ref={fileRef}
            name="image"
            type="file"
            accept="image/*"
            required
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
        </label>
        <input
          name="name"
          placeholder="Name (e.g. blue jeans)"
          required
          className="w-full border rounded-lg px-3 py-2"
        />
        <select name="category" defaultValue="other" className="w-full border rounded-lg px-3 py-2 capitalize">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          className="w-full bg-brand-600 text-white rounded-lg py-2 font-medium disabled:opacity-60"
        >
          {busy
            ? progress !== null
              ? `Uploading ${progress}%`
              : "Adding…"
            : "Add to wardrobe"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
      <PhotoAccessPrompt
        open={askPhoto}
        onCancel={() => setAskPhoto(false)}
        onContinue={continuePhotoAccess}
      />
    </Modal>
  );
}
