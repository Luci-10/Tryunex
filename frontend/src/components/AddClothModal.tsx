import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { api, type Cloth } from "../api";
import { useAuth } from "../auth";
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
  const { user } = useAuth();
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
      console.log("[upload] resizing", { size: file.size, type: file.type, name: file.name });
      const resized = await resizeImage(file);
      console.log("[upload] resized", { size: resized.size, type: resized.type });
      const rand = Math.random().toString(36).slice(2, 8);
      const pathname = `clothes/${user.id}/${Date.now()}-${rand}.jpg`;
      console.log("[upload] uploading to blob", { pathname });
      const blob = await upload(pathname, resized, {
        access: "public",
        contentType: "image/jpeg",
        handleUploadUrl: "/api/clothes/upload-token",
      });
      console.log("[upload] blob done", { url: blob.url });
      const r = await api.post<{ cloth: Cloth }>("/clothes", {
        imageUrl: blob.url,
        name,
        category,
      });
      console.log("[upload] metadata saved", r.cloth);
      onAdded(r.cloth);
      close();
    } catch (err: any) {
      console.error("[upload] failed", err);
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
