import { useCallback, useRef, useState } from "react";
import { api, type Cloth, type StyleTag } from "../api";
import { useAuth } from "../auth";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import { Input, Label, FieldError } from "./ui/Field";
import PhotoAccessPrompt from "./PhotoAccessPrompt";
import { hasPhotoConsent, grantPhotoConsent } from "../photoConsent";
import { nativePickerAvailable, pickPhotoNatively, type PickSource } from "../photoPicker";
import { resizeImage, putWithProgress } from "../upload";
import { STYLE_TAGS } from "../styleTags";
import { Camera, Check, ChevronLeft, Refresh } from "./ui/icons";

const CATEGORIES = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "dress", label: "Dress" },
  { value: "outerwear", label: "Outerwear" },
  { value: "shoes", label: "Shoes" },
  { value: "accessory", label: "Accessory" },
  { value: "other", label: "Other" },
];

// Browsers report ~0 for some HEIC/RAW files; the real guard is the resize
// step, but rejecting obvious monsters early saves a long wait.
const MAX_BYTES = 25 * 1024 * 1024;

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

  const [step, setStep] = useState<"photo" | "details">("photo");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("top");
  const [styleTag, setStyleTag] = useState<StyleTag>("casual");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askPhoto, setAskPhoto] = useState(false);

  function openWebPicker() {
    fileRef.current?.click();
  }

  async function startPick(source: PickSource = "gallery") {
    setError(null);
    if (nativePickerAvailable()) {
      const r = await pickPhotoNatively(source);
      if (r.ok) return accept(r.file);
      if (r.reason === "cancelled") return;
      if (r.reason === "unavailable") return openWebPicker(); // no native half in this build
      return setError(r.reason === "denied" ? r.message : r.message);
    }
    openWebPicker();
  }

  // First tap on a touch device gets the explainer; after that, straight in.
  function requestPhoto() {
    if (!hasPhotoConsent()) {
      setAskPhoto(true);
      return;
    }
    startPick("gallery");
  }

  function continueFromPrompt(source: PickSource) {
    grantPhotoConsent();
    setAskPhoto(false);
    setTimeout(() => startPick(source), 60);
  }

  function accept(f: File | undefined) {
    if (!f) return;
    if (f.type && !f.type.startsWith("image/")) {
      setError("That file isn't an image. Pick a photo instead.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That photo is over 25 MB. Try a smaller one.");
      return;
    }
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    setError(null);
    setStep("details");
  }

  function reset() {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setFile(null);
    setName("");
    setCategory("top");
    setStyleTag("casual");
    setStep("photo");
    setProgress(null);
    setError(null);
  }

  // Stable identity: an inline closure here would change on every keystroke,
  // and Sheet keys its focus effect on this.
  const close = useCallback(() => {
    if (busy) return; // never yank the sheet away mid-upload
    reset();
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, onClose]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
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
        styleTag,
      });
      onAdded(r.cloth);
      reset();
      onClose();
    } catch (err: any) {
      console.error("[upload] failed", err);
      setError(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const canSubmit = Boolean(file) && name.trim().length > 0 && !busy;

  return (
    <Sheet
      open={open}
      onClose={close}
      dismissible={!busy}
      title={step === "photo" ? "Add a piece" : "Details"}
      description={step === "photo" ? "A clear, well-lit photo works best." : undefined}
      footer={
        step === "photo" ? (
          <Button block size="lg" onClick={requestPhoto} leading={<Camera className="w-4 h-4" />}>
            {file ? "Replace photo" : "Take photo or choose from gallery"}
          </Button>
        ) : (
          <Button block size="lg" loading={busy} onClick={submit} disabled={!canSubmit}>
            {busy
              ? progress !== null
                ? `Uploading ${progress}%`
                : "Saving…"
              : "Add to wardrobe"}
          </Button>
        )
      }
    >
      {step === "photo" ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={requestPhoto}
            className="relative block w-full aspect-square rounded-2xl overflow-hidden bg-lilac border-2 border-dashed border-brand-200 active:scale-[0.99] transition-transform"
          >
            {preview ? (
              <img src={preview} alt="The photo you selected" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex flex-col items-center justify-center gap-2 text-brand-700">
                <Camera className="w-9 h-9" />
                <span className="text-sm font-semibold">Take photo or choose from gallery</span>
                <span className="text-xs text-ink/60">You pick exactly which photo to share</span>
              </span>
            )}
          </button>

          <FieldError>{error}</FieldError>

          {/* No `capture` attribute — with it, the OS skips the gallery. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              accept(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-3">
            {preview && (
              <img
                src={preview}
                alt="The photo you selected"
                className="w-16 h-16 rounded-xl object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setStep("photo")}
                leading={<ChevronLeft className="w-4 h-4" />}
                disabled={busy}
              >
                Change photo
              </Button>
            </div>
          </div>

          {busy && progress !== null && (
            <div>
              <div className="flex items-center justify-between text-[12px] text-ink/70 mb-1">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div
                className="h-1.5 rounded-full bg-ink/10 overflow-hidden"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
              >
                <div
                  className="h-full bg-brand-500 transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <label className="block">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. blue denim jacket"
              maxLength={80}
              enterKeyHint="done"
              required
            />
          </label>

          <ChipGroup
            label="Category"
            options={CATEGORIES}
            value={category}
            onChange={setCategory}
          />

          <ChipGroup
            label="Style"
            hint="Helps the assistant match outfits to the occasion"
            options={STYLE_TAGS}
            value={styleTag}
            onChange={(v) => setStyleTag(v as StyleTag)}
          />

          <FieldError>{error}</FieldError>
        </form>
      )}

      <PhotoAccessPrompt
        open={askPhoto}
        onCancel={() => setAskPhoto(false)}
        onContinue={continueFromPrompt}
      />
    </Sheet>
  );
}

function ChipGroup({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`inline-flex items-center gap-1 h-9 px-3 rounded-full text-[13px] border transition-colors ${
                active
                  ? "bg-brand-500 text-white border-brand-500 font-medium"
                  : "bg-white text-ink/70 border-ink/12 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              {active && <Check className="w-3.5 h-3.5" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
