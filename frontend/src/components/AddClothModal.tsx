import { useRef, useState } from "react";
import { api, type Cloth } from "../api";
import Modal from "./Modal";

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

// Phone camera photos are routinely 3-8 MB, but Vercel functions cap request
// bodies at 4.5 MB. Re-encode to ≤1280px JPEG so the upload stays under the
// limit and matches the resolution actually rendered in the wardrobe grid.
async function resizeImage(file: File, maxSide = 1280, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
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
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    formRef.current?.reset();
    setPreview(null);
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("image");
    if (file instanceof File && file.size > 0) {
      try {
        const resized = await resizeImage(file);
        fd.set("image", resized, file.name.replace(/\.[^.]+$/, "") + ".jpg");
      } catch (err: any) {
        setError(err.message ?? "Could not process image");
        return;
      }
    }
    setBusy(true);
    try {
      const r = await api.postForm<{ cloth: Cloth }>("/clothes", fd);
      onAdded(r.cloth);
      close();
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add a piece">
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <label className="relative aspect-square bg-brand-50 rounded-xl border-2 border-dashed border-brand-200 flex items-center justify-center cursor-pointer overflow-hidden block">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-brand-600 text-sm text-center px-4">Tap to choose a photo<br /><span className="text-xs text-gray-500">(or take one with your camera)</span></span>
          )}
          <input
            name="image"
            type="file"
            accept="image/*"
            capture="environment"
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
          {busy ? "Adding…" : "Add to wardrobe"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
