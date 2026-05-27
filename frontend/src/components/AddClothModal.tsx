import { useRef, useState } from "react";
import { api, type Cloth } from "../api";
import Modal from "./Modal";

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

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
