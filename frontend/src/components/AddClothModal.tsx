import { useRef, useState } from "react";
import { api, type Cloth } from "../api";
import { useAuth } from "../auth";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import { Input, Label, Select, FieldError } from "./ui/Field";
import PhotoAccessPrompt from "./PhotoAccessPrompt";
import { hasPhotoConsent, grantPhotoConsent } from "../photoConsent";
import { resizeImage, putWithProgress } from "../upload";
import { Camera, Refresh } from "./ui/icons";

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
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askPhoto, setAskPhoto] = useState(false);

  // First-ever upload on a touch device gets the explainer before the OS picker.
  function openPicker() {
    if (!hasPhotoConsent()) {
      setAskPhoto(true);
      return;
    }
    fileRef.current?.click();
  }

  function continuePhotoAccess() {
    grantPhotoConsent();
    setAskPhoto(false);
    setTimeout(() => fileRef.current?.click(), 60);
  }

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    setError(null);
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setName("");
    setCategory("other");
    setProgress(null);
    setError(null);
  }

  function close() {
    if (busy) return; // never yank the sheet out mid-upload
    reset();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return setError("You're signed out — sign in again to add pieces.");
    if (!file) return setError("Choose a photo first.");
    if (!name.trim()) return setError("Give this piece a name.");

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
        name: name.trim(),
        category,
      });
      onAdded(r.cloth);
      reset();
      onClose();
    } catch (err: any) {
      console.error("[upload] failed", err);
      setError(err.message ?? "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      dismissible={!busy}
      title="Add a piece"
      description="A clear, well-lit photo works best."
      footer={
        <Button block size="lg" loading={busy} onClick={submit} disabled={!file || !name.trim()}>
          {busy ? (progress !== null ? `Uploading ${progress}%` : "Saving…") : "Add to wardrobe"}
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-lilac border-2 border-dashed border-brand-200">
            {preview ? (
              <img src={preview} alt="The photo you selected" className="w-full h-full object-cover" />
            ) : (
              <button
                type="button"
                onClick={openPicker}
                className="w-full h-full flex flex-col items-center justify-center gap-2 text-brand-700"
              >
                <Camera className="w-8 h-8" />
                <span className="text-sm font-medium">Choose a photo</span>
                <span className="text-xs text-ink/65">or take one with your camera</span>
              </button>
            )}

            {preview && !busy && (
              <button
                type="button"
                onClick={openPicker}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/95 text-ink text-sm font-medium shadow-card backdrop-blur-sm"
              >
                <Refresh className="w-4 h-4" />
                Replace
              </button>
            )}

            {busy && progress !== null && (
              <div className="absolute inset-x-0 bottom-0 bg-ink/70 px-3 py-2.5 backdrop-blur-sm">
                <div className="flex items-center justify-between text-white text-xs font-medium mb-1.5">
                  <span>Uploading…</span>
                  <span>{progress}%</span>
                </div>
                <div
                  className="h-1.5 rounded-full bg-white/25 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                >
                  <div
                    className="h-full bg-white transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* No `capture` attribute — with it the OS skips the gallery entirely. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>

        <label className="block">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. blue denim jacket"
            maxLength={80}
            required
          />
        </label>

        <label className="block">
          <Label>Category</Label>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="capitalize"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>

        <FieldError>{error}</FieldError>
      </form>

      <PhotoAccessPrompt
        open={askPhoto}
        onCancel={() => setAskPhoto(false)}
        onContinue={continuePhotoAccess}
      />
    </Sheet>
  );
}
