import { useEffect, useState } from "react";
import Modal from "./Modal";
import Lightbox from "./Lightbox";
import { api, type Cloth } from "../api";

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

type Detail = { cloth: Cloth; wearCount: number; lastWornOn: string | null };

export default function ClothDetailModal({
  clothId,
  open,
  onClose,
  onSaved,
  onDeleted,
  onWearToday,
}: {
  clothId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: (c: Cloth) => void;
  onDeleted: (id: string) => void;
  onWearToday: (id: string) => Promise<void>;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!open || !clothId) return;
    setData(null);
    setError(null);
    api.get<Detail>(`/clothes/${clothId}`)
      .then((d) => {
        setData(d);
        setName(d.cloth.name);
        setCategory(d.cloth.category);
      })
      .catch((e) => setError(e.message ?? "Could not load"));
  }, [clothId, open]);

  if (!clothId) return null;
  const dirty = data ? name.trim() !== data.cloth.name || category !== data.cloth.category : false;

  async function save() {
    if (!data || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.patch<{ cloth: Cloth }>(`/clothes/${data.cloth.id}`, {
        name: name.trim(),
        category,
      });
      onSaved(r.cloth);
      setData({ ...data, cloth: r.cloth });
    } catch (err: any) {
      setError(err.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!data) return;
    if (!confirm(`Delete "${data.cloth.name}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/clothes/${data.cloth.id}`);
      onDeleted(data.cloth.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function wearToday() {
    if (!data) return;
    setBusy(true);
    try {
      await onWearToday(data.cloth.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <Lightbox src={zoom && data ? data.cloth.imageUrl : null} alt={data?.cloth.name} onClose={() => setZoom(false)} />
    <Modal open={open} onClose={onClose} title="Edit piece">
      {!data ? (
        <p className="text-gray-500 text-sm">{error ?? "Loading…"}</p>
      ) : (
        <div className="space-y-4">
          <div
            onClick={() => setZoom(true)}
            className="aspect-square bg-gray-100 rounded-xl overflow-hidden cursor-zoom-in"
          >
            <img src={data.cloth.imageUrl} alt={data.cloth.name} className="w-full h-full object-cover" />
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Worn</div>
              <div className="font-semibold text-lg">
                {data.wearCount} <span className="text-xs text-gray-500 font-normal">time{data.wearCount === 1 ? "" : "s"}</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Last worn</div>
              <div className="font-semibold">
                {data.lastWornOn
                  ? new Date(data.lastWornOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "—"}
              </div>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2 capitalize"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <div className="flex gap-2 pt-2">
            <button
              disabled={busy}
              onClick={wearToday}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 font-medium disabled:opacity-60"
            >
              Wear today
            </button>
            <button
              disabled={busy || !dirty || !name.trim()}
              onClick={save}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 font-medium disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
          <button
            disabled={busy}
            onClick={del}
            className="w-full text-sm bg-red-50 hover:bg-red-100 text-red-700 rounded-lg py-2"
          >
            Delete this piece
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
    </>
  );
}
