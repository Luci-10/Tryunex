import { useEffect, useRef, useState } from "react";
import Nav from "../components/Nav";
import Lightbox from "../components/Lightbox";
import { api, type Cloth } from "../api";
import { useTryOn, type Outfit } from "../tryon";

type Selfie = { id: string; imageUrl: string; createdAt: string };
type Result = {
  id: string;
  imageUrl: string;
  createdAt: string;
  clothId: string | null;
};

// Whatever is shown in the hero slot at the top — either the user's actual
// selfie or the most recent try-on preview. Purely client state; refresh /
// logout resets it back to `selfie`.
type Displayed =
  | { kind: "selfie" }
  | { kind: "tryon"; url: string; outfitLabel: string };

async function resizeImage(file: File, maxSide = 1024, quality = 0.85): Promise<Blob> {
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

export default function Tryon() {
  const { outfits, newOutfit, deleteOutfit, addCloth, removeCloth } = useTryOn();
  const [selfie, setSelfie] = useState<Selfie | null>(null);
  const [clothes, setClothes] = useState<Cloth[]>([]);
  const [displayed, setDisplayed] = useState<Displayed>({ kind: "selfie" });
  const [loading, setLoading] = useState(true);
  const [busyOutfitId, setBusyOutfitId] = useState<string | null>(null);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const outfitsRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      // History endpoint isn't used here — try-on results now live only in
      // the displayed slot (ephemeral) and the backend cache (for re-use).
      const [s, c] = await Promise.all([
        api.get<{ selfie: Selfie | null }>("/tryon/selfie"),
        api.get<{ clothes: Cloth[] }>("/clothes?status=clean"),
      ]);
      setSelfie(s.selfie);
      setClothes(c.clothes);
    } catch (err: any) {
      setError(err.message ?? "Could not load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Scroll the outfits banner into view when something gets added.
  useEffect(() => {
    if (outfits.length > 0) outfitsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [outfits.length]);

  async function onSelfieChange(file: File) {
    setError(null);
    setUploadingSelfie(true);
    setUploadProgress(0);
    try {
      const resized = await resizeImage(file);
      const { uploadUrl, publicUrl } = await api.post<{ uploadUrl: string; publicUrl: string }>(
        "/tryon/selfie/upload-url",
        {},
      );
      await putWithProgress(uploadUrl, resized, "image/jpeg", setUploadProgress);
      const r = await api.post<{ selfie: Selfie }>("/tryon/selfie", { imageUrl: publicUrl });
      setSelfie(r.selfie);
    } catch (err: any) {
      setError(err.message ?? "Selfie upload failed");
    } finally {
      setUploadingSelfie(false);
      setUploadProgress(null);
    }
  }

  async function apply(outfit: Outfit) {
    if (!selfie) {
      setError("Upload a selfie first");
      return;
    }
    if (outfit.clothes.length === 0) return;
    setError(null);
    setBusyOutfitId(outfit.id);
    try {
      const r = await api.post<{ result: Result; cached: boolean }>("/tryon/generate", {
        clothIds: outfit.clothes.map((c) => c.id),
      });
      const label =
        outfit.clothes.length === 1
          ? outfit.clothes[0].name
          : `${outfit.clothes[0].name} + ${outfit.clothes.length - 1} more`;
      // Replace the displayed image with the try-on result. Outfit stays
      // in pending so the user can re-apply (cache makes that instant).
      setDisplayed({ kind: "tryon", url: r.result.imageUrl, outfitLabel: label });
    } catch (err: any) {
      setError(err.message ?? "Try-on failed");
    } finally {
      setBusyOutfitId(null);
    }
  }

  function showOriginal() {
    setDisplayed({ kind: "selfie" });
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-6 text-gray-500">Loading…</main>
      </>
    );
  }

  // The cloth grid at the bottom adds to the LAST outfit (or creates one).
  // This mirrors tryOn() in the context.
  function pickFromGrid(cloth: Cloth) {
    const target = outfits[outfits.length - 1];
    if (!target) {
      const id = newOutfit();
      // newOutfit returned an id but setOutfits is async — defer add.
      setTimeout(() => addCloth(id, cloth), 0);
    } else {
      addCloth(target.id, cloth);
    }
  }

  return (
    <>
      <Nav />
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 pb-24">
        <div>
          <h1 className="text-xl font-bold">Try-on Studio</h1>
          <p className="text-sm text-gray-600">
            Build outfits below and tap <em>Put on me</em> to see each one on you.
          </p>
        </div>

        {/* Hero block — shows either the actual selfie or the last try-on
            result. Replacing the selfie file goes via the dashed border;
            the try-on overlay shows what's currently displayed and offers
            "Show original" to revert. */}
        <section className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-3">
          <div className="relative w-56 h-56 sm:w-64 sm:h-64">
            {displayed.kind === "tryon" ? (
              <>
                <img
                  src={displayed.url}
                  alt="Try-on preview"
                  className="w-full h-full rounded-2xl object-cover bg-gray-100 cursor-zoom-in"
                  onClick={() => setZoom(displayed.url)}
                />
                <span className="absolute top-2 left-2 bg-brand-600 text-white text-[10px] font-medium px-2 py-1 rounded-full shadow">
                  Wearing: {displayed.outfitLabel}
                </span>
              </>
            ) : (
              <label className="relative w-full h-full bg-brand-50 rounded-2xl border-2 border-dashed border-brand-200 flex items-center justify-center cursor-pointer overflow-hidden block">
                {selfie ? (
                  <img src={selfie.imageUrl} alt="Your selfie" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-brand-600 text-sm text-center px-3">
                    Tap to upload your<br />try-on photo
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingSelfie}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onSelfieChange(f);
                  }}
                />
                {uploadingSelfie && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs text-center py-1">
                    Uploading {uploadProgress ?? 0}%…
                  </span>
                )}
              </label>
            )}
          </div>
          {displayed.kind === "tryon" ? (
            <button
              onClick={showOriginal}
              className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-3 py-1.5 rounded-full"
            >
              ← Show original photo
            </button>
          ) : (
            <div className="text-xs text-gray-500 text-center max-w-xs">
              {selfie
                ? "Tap the photo to replace it. Front-facing, plain background works best."
                : "Front-facing, plain background, upper-body or full-body works best."}
            </div>
          )}
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Pending outfits */}
        <section ref={outfitsRef} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Outfits {outfits.length > 0 && <span className="text-gray-400 font-normal">· {outfits.length}</span>}
            </h2>
            <button
              onClick={() => newOutfit()}
              className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 font-medium px-3 py-1.5 rounded-full"
            >
              + New outfit
            </button>
          </div>

          {outfits.length === 0 ? (
            <p className="text-sm text-gray-500">
              Tap the <strong>👤 Try</strong> button on any cloth (Wardrobe, Plan, friend's wardrobe, chat) to start an outfit here.
            </p>
          ) : (
            outfits.map((o, idx) => (
              <OutfitCard
                key={o.id}
                outfit={o}
                index={idx}
                isLast={idx === outfits.length - 1}
                hasSelfie={!!selfie}
                busy={busyOutfitId === o.id}
                onApply={() => apply(o)}
                onDiscard={() => deleteOutfit(o.id)}
                onRemove={(cid) => removeCloth(o.id, cid)}
              />
            ))
          )}
        </section>

        {/* Cloth picker — adds to the last outfit (or creates one) */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Pick clothes</h2>
          <p className="text-xs text-gray-500">
            Tap any cloth to add it to {outfits.length === 0 ? "a new outfit" : `outfit ${outfits.length}`}.
          </p>
          {clothes.length === 0 ? (
            <p className="text-sm text-gray-500">No clean clothes in your wardrobe yet.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {clothes.map((c) => {
                const inLast = outfits[outfits.length - 1]?.clothes.some((x) => x.id === c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => pickFromGrid(c)}
                    className={`relative bg-white rounded-xl shadow-sm overflow-hidden text-left ${
                      inLast ? "ring-2 ring-brand-500" : ""
                    }`}
                  >
                    <div className="aspect-square">
                      <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-1.5">
                      <div className="text-xs font-medium truncate">{c.name}</div>
                      <div className="text-[10px] text-gray-500 capitalize">{c.category}</div>
                    </div>
                    {inLast && (
                      <span className="absolute top-1 right-1 bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

      </main>
    </>
  );
}

function OutfitCard({
  outfit,
  index,
  isLast,
  hasSelfie,
  busy,
  onApply,
  onDiscard,
  onRemove,
}: {
  outfit: Outfit;
  index: number;
  isLast: boolean;
  hasSelfie: boolean;
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onRemove: (clothId: string) => void;
}) {
  const empty = outfit.clothes.length === 0;
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm p-4 space-y-3 border ${
        isLast ? "border-brand-300" : "border-transparent"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          Outfit {index + 1}
          {isLast && outfit.clothes.length > 0 && (
            <span className="ml-2 text-xs text-brand-700 font-normal">· active</span>
          )}
        </h3>
      </div>

      {empty ? (
        <p className="text-xs text-gray-500">
          Empty — tap clothes below or use the <strong>👤 Try</strong> button anywhere to add.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {outfit.clothes.map((c) => (
            <div key={c.id} className="relative flex-shrink-0">
              <img
                src={c.imageUrl}
                alt={c.name}
                className="w-16 h-16 rounded-lg object-cover bg-gray-100"
              />
              <button
                onClick={() => onRemove(c.id)}
                disabled={busy}
                className="absolute -top-1.5 -right-1.5 bg-white border border-gray-300 hover:bg-red-50 hover:border-red-300 text-gray-600 hover:text-red-700 rounded-full w-5 h-5 text-xs leading-none shadow-sm disabled:opacity-50"
                aria-label="Remove"
              >
                ×
              </button>
              <div className="text-[10px] text-gray-500 mt-1 max-w-[64px] truncate">{c.name}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onDiscard}
          disabled={busy}
          className="flex-1 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-300 text-gray-700 border border-gray-300 rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          Discard
        </button>
        {!empty && (
          <button
            onClick={onApply}
            disabled={busy || !hasSelfie}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {busy
              ? "Generating…"
              : !hasSelfie
              ? "Upload selfie ↓"
              : `Put on me (${outfit.clothes.length})`}
          </button>
        )}
      </div>
      {busy && (
        <p className="text-xs text-gray-500 text-center">Takes 5-15 seconds. Hold tight.</p>
      )}
    </div>
  );
}
