import { useEffect, useMemo, useRef, useState } from "react";
import PageShell from "../components/PageShell";
import Lightbox from "../components/Lightbox";
import PhotoAccessPrompt from "../components/PhotoAccessPrompt";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import { FilterChip, Badge } from "../components/ui/Chip";
import EmptyState from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Close,
  Refresh,
  Shirt,
  Sparkles,
  Zoom,
} from "../components/ui/icons";
import { api, type Cloth } from "../api";
import { useTryOn, MAX_OUTFIT_ITEMS } from "../tryon";
import { hasPhotoConsent, grantPhotoConsent } from "../photoConsent";
import { resizeImage, putWithProgress } from "../upload";

type Selfie = { id: string; imageUrl: string; createdAt: string };
type Result = { id: string; imageUrl: string; createdAt: string; clothId: string | null };

/** A garment offered in the picker, tagged with whose wardrobe it came from. */
type PickerItem = Cloth & { ownerName?: string };

const STEPS = ["Your photo", "Build your look", "Preview", "Your look"] as const;
type Step = 0 | 1 | 2 | 3;

const CATEGORY_ORDER = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

export default function Tryon() {
  const { active, newOutfit, addCloth, removeCloth, deleteOutfit } = useTryOn();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [step, setStep] = useState<Step>(0);
  const [selfie, setSelfie] = useState<Selfie | null>(null);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [cached, setCached] = useState(false);
  const [showingOriginal, setShowingOriginal] = useState(false);

  const [cat, setCat] = useState<string | "all">("all");
  const [zoom, setZoom] = useState<string | null>(null);
  const [askPhoto, setAskPhoto] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const selected = active?.clothes ?? [];
  const full = selected.length >= MAX_OUTFIT_ITEMS;

  // --- data -----------------------------------------------------------
  async function load() {
    setLoadError(null);
    try {
      const [s, mine, shares] = await Promise.all([
        api.get<{ selfie: Selfie | null }>("/tryon/selfie"),
        api.get<{ clothes: Cloth[] }>("/clothes?status=clean"),
        api
          .get<{ shares: { ownerId: string; ownerName: string; allowTryon: boolean }[] }>(
            "/share/i-can-see",
          )
          .catch(() => ({ shares: [] })),
      ]);
      setSelfie(s.selfie);

      // Friends' clothes are only offered when that friend opted into try-on.
      const tryonFriends = shares.shares.filter((f) => f.allowTryon);
      const friendClothes = await Promise.all(
        tryonFriends.map((f) =>
          api
            .get<{ clothes: Cloth[] }>(`/friends/${f.ownerId}/wardrobe`)
            .then((r) => r.clothes.map((c) => ({ ...c, ownerName: f.ownerName })))
            .catch(() => [] as PickerItem[]),
        ),
      );
      setItems([...mine.clothes, ...friendClothes.flat()]);
    } catch (err: any) {
      setLoadError(err.message ?? "Could not load the studio");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  // --- navigation -----------------------------------------------------
  function goTo(next: Step) {
    setStep(next);
    setAnnouncement(`Step ${next + 1} of 4: ${STEPS[next]}`);
  }

  const canGoNext = (from: Step) => {
    if (from === 1) return selected.length > 0;
    return from < 3;
  };

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  // Swipe is a bonus on top of the Back/Next buttons, never the only way.
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx < 0 && step < 3 && canGoNext(step)) goTo((step + 1) as Step);
    if (dx > 0 && step > 0) goTo((step - 1) as Step);
  }

  // --- selfie ---------------------------------------------------------
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

  async function uploadSelfie(file: File) {
    setUploadError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      // Selfies get more resolution than wardrobe shots — Gemini works from it.
      const resized = await resizeImage(file, 1024, 0.85);
      const { uploadUrl, publicUrl } = await api.post<{ uploadUrl: string; publicUrl: string }>(
        "/tryon/selfie/upload-url",
        {},
      );
      await putWithProgress(uploadUrl, resized, "image/jpeg", setUploadProgress);
      const r = await api.post<{ selfie: Selfie }>("/tryon/selfie", { imageUrl: publicUrl });
      setSelfie(r.selfie);
      setResult(null);
      setShowingOriginal(false);
      // Deliberately no auto-advance — let them look at the photo first.
      setAnnouncement("Photo uploaded. Review it, then continue to build your look.");
      toast("Photo saved", { tone: "success" });
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  // --- outfit ---------------------------------------------------------
  function pick(cloth: PickerItem) {
    const inLook = selected.some((c) => c.id === cloth.id);
    if (inLook) {
      if (active) removeCloth(active.id, cloth.id);
      return;
    }
    if (full) {
      toast(`A look holds ${MAX_OUTFIT_ITEMS} pieces — remove one first`, { tone: "error" });
      return;
    }
    if (!active) {
      const id = newOutfit();
      // newOutfit's state update hasn't flushed yet, so defer the add.
      setTimeout(() => addCloth(id, cloth), 0);
    } else {
      addCloth(active.id, cloth);
    }
  }

  async function startNewLook() {
    if (active && selected.length > 0) {
      const ok = await confirm({
        title: "Start a new look?",
        body: "Your current selection is cleared. Your photo stays.",
        confirmLabel: "Start new",
      });
      if (!ok) return;
      deleteOutfit(active.id);
    }
    setResult(null);
    setCached(false);
    setGenError(null);
    setShowingOriginal(false);
    goTo(1);
  }

  // --- generate -------------------------------------------------------
  async function generate() {
    if (generating) return; // hard guard against a double submit
    if (!selfie) {
      setGenError("Add your photo first — step 1.");
      return;
    }
    if (selected.length === 0) {
      setGenError("Pick at least one piece to wear.");
      return;
    }
    setGenError(null);
    setGenerating(true);
    setAnnouncement("Creating your look. This usually takes 5 to 15 seconds.");
    try {
      const r = await api.post<{ result: Result; cached: boolean }>("/tryon/generate", {
        clothIds: selected.map((c) => c.id),
      });
      setResult(r.result);
      setCached(r.cached);
      setShowingOriginal(false);
      goTo(3);
      setAnnouncement("Your look is ready.");
    } catch (err: any) {
      const msg = err.message ?? "Could not create your look";
      setGenError(msg);
      setAnnouncement(`Try-on failed. ${msg}`);
    } finally {
      setGenerating(false);
    }
  }

  // --- derived --------------------------------------------------------
  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [items]);

  const visibleItems = useMemo(
    () => (cat === "all" ? items : items.filter((i) => i.category === cat)),
    [items, cat],
  );

  const heroSrc = result && !showingOriginal ? result.imageUrl : selfie?.imageUrl ?? null;

  return (
    <PageShell width="wide">
      <Lightbox src={zoom} alt="Your try-on look" onClose={() => setZoom(null)} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Try-on Studio</h1>
          <p className="text-sm text-ink/65 mt-1">
            Your photo, your clothes, one generated look at a time.
          </p>
        </div>
        {(selected.length > 0 || result) && (
          <Button variant="secondary" size="sm" onClick={startNewLook}>
            New look
          </Button>
        )}
      </div>

      {loadError && <ErrorBanner onRetry={() => load()}>{loadError}</ErrorBanner>}

      {/* Announcements for screen readers: step changes and generation state. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="md:flex md:gap-6 md:items-start">
        <StepRail step={step} onGo={goTo} canReach={(s) => s <= 1 || selected.length > 0} />

        <div
          className="flex-1 min-w-0 space-y-4"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <StepDots step={step} />

          {/* key forces a fresh mount per step so the transition replays */}
          <div key={step} className="animate-sheet-up motion-reduce:animate-none">
            {step === 0 && (
              <PhotoStep
                selfie={selfie}
                loading={loading}
                uploading={uploading}
                progress={uploadProgress}
                error={uploadError}
                showingResult={Boolean(result) && !showingOriginal}
                onPick={openPicker}
                onShowOriginal={() => setShowingOriginal(true)}
                heroSrc={heroSrc}
              />
            )}

            {step === 1 && (
              <BuildStep
                loading={loading}
                items={visibleItems}
                allCount={items.length}
                categories={categories}
                cat={cat}
                onCat={setCat}
                selected={selected}
                full={full}
                onPick={pick}
                onRemove={(id) => active && removeCloth(active.id, id)}
                onNext={() => goTo(2)}
              />
            )}

            {step === 2 && (
              <PreviewStep
                selfie={selfie}
                selected={selected}
                generating={generating}
                error={genError}
                onGenerate={generate}
                onEditOutfit={() => goTo(1)}
                onAddPhoto={() => goTo(0)}
              />
            )}

            {step === 3 && (
              <ResultStep
                result={result}
                cached={cached}
                selected={selected}
                showingOriginal={showingOriginal}
                selfieUrl={selfie?.imageUrl ?? null}
                onZoom={(src) => setZoom(src)}
                onToggleOriginal={() => setShowingOriginal((v) => !v)}
                onRetry={generate}
                generating={generating}
                onEditOutfit={() => goTo(1)}
                onNewLook={startNewLook}
                error={genError}
              />
            )}
          </div>

          {/* Explicit stage controls — mandatory, swipe is only a shortcut.
              Right padding on phones keeps "Next" clear of the chat FAB. */}
          <div className="flex items-center gap-2 pt-1 pr-[4.5rem] md:pr-0">
            <Button
              variant="secondary"
              disabled={step === 0}
              onClick={() => goTo((step - 1) as Step)}
              leading={<ChevronLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <span className="text-[13px] text-ink/65 mx-auto">
              Step {step + 1} of {STEPS.length}
            </span>
            {step < 3 ? (
              <Button
                disabled={!canGoNext(step)}
                onClick={() => goTo((step + 1) as Step)}
                className="flex-row-reverse"
                leading={<ChevronRight className="w-4 h-4" />}
              >
                Next
              </Button>
            ) : (
              <Button variant="secondary" onClick={startNewLook}>
                New look
              </Button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadSelfie(f);
          e.target.value = "";
        }}
      />
      <PhotoAccessPrompt
        open={askPhoto}
        onCancel={() => setAskPhoto(false)}
        onContinue={continuePhotoAccess}
      />
    </PageShell>
  );
}

/* ---------------------------------------------------------------- rail */

function StepRail({
  step,
  onGo,
  canReach,
}: {
  step: Step;
  onGo: (s: Step) => void;
  canReach: (s: Step) => boolean;
}) {
  return (
    <nav aria-label="Try-on steps" className="hidden md:block w-56 shrink-0 sticky top-20">
      <ol className="space-y-1">
        {STEPS.map((label, i) => {
          const active = step === i;
          const reachable = canReach(i as Step);
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                onClick={() => onGo(i as Step)}
                className={`w-full flex items-center gap-3 px-3 h-12 rounded-xl text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  active ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink/65 hover:bg-ink/[0.04]"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold shrink-0 ${
                    step > i
                      ? "bg-mint text-emerald-800"
                      : active
                        ? "bg-brand-500 text-white"
                        : "bg-ink/[0.07] text-ink/65"
                  }`}
                >
                  {step > i ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="md:hidden">
      <p className="text-[13px] font-semibold mb-1.5">{STEPS[step]}</p>
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all duration-200 ${
              i === step ? "flex-[2] bg-brand-500" : i < step ? "flex-1 bg-brand-300" : "flex-1 bg-ink/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- step 1: photo */

function PhotoStep({
  selfie,
  loading,
  uploading,
  progress,
  error,
  showingResult,
  onPick,
  onShowOriginal,
  heroSrc,
}: {
  selfie: Selfie | null;
  loading: boolean;
  uploading: boolean;
  progress: number | null;
  error: string | null;
  showingResult: boolean;
  onPick: () => void;
  onShowOriginal: () => void;
  heroSrc: string | null;
}) {
  return (
    <section className="surface p-4 sm:p-5 space-y-4">
      <div className="relative mx-auto w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden bg-lilac border-2 border-dashed border-brand-200">
        {loading ? (
          <Skeleton className="w-full h-full rounded-none" />
        ) : heroSrc ? (
          <img
            src={heroSrc}
            alt={showingResult ? "Your generated look" : "Your try-on photo"}
            className="w-full h-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={onPick}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-brand-700"
          >
            <Camera className="w-9 h-9" />
            <span className="text-sm font-semibold">Add your photo</span>
            <span className="text-xs text-ink/65">Tap to choose or take one</span>
          </button>
        )}

        {selfie && !uploading && (
          <button
            type="button"
            onClick={onPick}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/95 text-ink text-sm font-medium shadow-card backdrop-blur-sm"
          >
            <Refresh className="w-4 h-4" />
            Replace
          </button>
        )}

        {showingResult && (
          <button
            type="button"
            onClick={onShowOriginal}
            className="absolute bottom-3 left-3 h-9 px-3 rounded-full bg-ink/70 text-white text-sm font-medium backdrop-blur-sm"
          >
            Show original photo
          </button>
        )}

        {uploading && progress !== null && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/70 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center justify-between text-white text-xs font-medium mb-1.5">
              <span>Uploading your photo…</span>
              <span>{progress}%</span>
            </div>
            <div
              className="h-1.5 rounded-full bg-white/25 overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Photo upload progress"
            >
              <div
                className="h-full bg-white transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner onRetry={onPick}>{error}</ErrorBanner>}

      <p className="text-[13px] text-ink/65 text-center max-w-sm mx-auto leading-relaxed">
        Face the camera, plain background, upper or full body. Good light makes a noticeable
        difference to the result.
      </p>
    </section>
  );
}

/* --------------------------------------------------------- step 2: build */

function BuildStep({
  loading,
  items,
  allCount,
  categories,
  cat,
  onCat,
  selected,
  full,
  onPick,
  onRemove,
  onNext,
}: {
  loading: boolean;
  items: PickerItem[];
  allCount: number;
  categories: string[];
  cat: string | "all";
  onCat: (c: string | "all") => void;
  selected: Cloth[];
  full: boolean;
  onPick: (c: PickerItem) => void;
  onRemove: (id: string) => void;
  onNext: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="surface p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Your look</h2>
          <Badge tone={full ? "peach" : "lilac"}>
            {selected.length}/{MAX_OUTFIT_ITEMS}
          </Badge>
        </div>

        {selected.length === 0 ? (
          <p className="text-[13px] text-ink/65">
            Nothing picked yet. Tap up to {MAX_OUTFIT_ITEMS} pieces below.
          </p>
        ) : (
          <ul className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {selected.map((c) => (
              <li key={c.id} className="relative shrink-0 w-16">
                <img
                  src={c.imageUrl}
                  alt={c.name}
                  className="w-16 h-16 rounded-xl object-cover bg-ink/[0.05]"
                />
                <p className="text-[10px] text-ink/65 truncate mt-1">{c.name}</p>
                <IconButton
                  label={`Remove ${c.name} from your look`}
                  size="sm"
                  onClick={() => onRemove(c.id)}
                  className="absolute -top-1.5 -right-1.5 shadow-card"
                >
                  <Close className="w-3.5 h-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <Button block disabled={selected.length === 0} onClick={onNext}>
          Try this outfit
        </Button>
      </div>

      {allCount > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          <FilterChip active={cat === "all"} onClick={() => onCat("all")}>
            All
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c} active={cat === c} onClick={() => onCat(c)}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </FilterChip>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Shirt className="w-7 h-7" />}
          title={allCount === 0 ? "No clothes to try on" : "Nothing in this category"}
          body={
            allCount === 0
              ? "Add pieces to your wardrobe, then come back and build a look."
              : "Pick another category to keep browsing."
          }
        />
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {items.map((c) => {
            const picked = selected.some((x) => x.id === c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  aria-pressed={picked}
                  aria-label={`${picked ? "Remove" : "Add"} ${c.name}`}
                  className={`relative w-full rounded-xl overflow-hidden bg-white border text-left transition-colors ${
                    picked ? "border-brand-500 ring-2 ring-brand-500/40" : "border-ink/[0.07]"
                  }`}
                >
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    loading="lazy"
                    className="w-full aspect-square object-cover bg-ink/[0.04]"
                  />
                  <span className="block px-2 py-1.5">
                    <span className="block text-[11px] font-medium truncate">{c.name}</span>
                    <span className="block text-[10px] text-ink/65 truncate">
                      {c.ownerName ? `${c.ownerName}'s` : c.category}
                    </span>
                  </span>
                  {picked && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-500 text-white grid place-items-center">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------- step 3: preview */

function PreviewStep({
  selfie,
  selected,
  generating,
  error,
  onGenerate,
  onEditOutfit,
  onAddPhoto,
}: {
  selfie: Selfie | null;
  selected: Cloth[];
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
  onEditOutfit: () => void;
  onAddPhoto: () => void;
}) {
  const blocked = !selfie ? "Add your photo in step 1 first." : selected.length === 0 ? "Pick at least one piece." : null;

  return (
    <section className="surface p-4 sm:p-5 space-y-4">
      {generating ? (
        <div className="mx-auto w-full max-w-sm aspect-[3/4] rounded-2xl bg-lilac shimmer grid place-items-center">
          <div className="text-center px-6">
            <Sparkles className="w-8 h-8 mx-auto text-brand-600" />
            <p className="font-semibold text-sm mt-3">Putting your look together…</p>
            <p className="text-[13px] text-ink/65 mt-1">Usually 5–15 seconds. Hold tight.</p>
          </div>
        </div>
      ) : (
        // Collage: the photo behind, the chosen pieces layered along the edge.
        <div className="relative mx-auto w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden bg-lilac">
          {selfie ? (
            <img src={selfie.imageUrl} alt="Your try-on photo" className="w-full h-full object-cover" />
          ) : (
            <button
              type="button"
              onClick={onAddPhoto}
              className="w-full h-full flex flex-col items-center justify-center gap-2 text-brand-700"
            >
              <Camera className="w-8 h-8" />
              <span className="text-sm font-semibold">Add your photo</span>
            </button>
          )}
          {selected.length > 0 && (
            <ul className="absolute left-3 bottom-3 flex -space-x-3">
              {selected.map((c) => (
                <li key={c.id}>
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    className="w-14 h-14 rounded-xl object-cover border-2 border-white shadow-card bg-white"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="text-center">
        <p className="text-sm font-semibold">
          {selected.length} piece{selected.length === 1 ? "" : "s"} selected
        </p>
        <p className="text-[13px] text-ink/65 mt-0.5 truncate">
          {selected.map((c) => c.name).join(" · ") || "Nothing picked yet"}
        </p>
      </div>

      {error && <ErrorBanner onRetry={onGenerate}>{error}</ErrorBanner>}

      <div className="space-y-2">
        <Button
          block
          size="lg"
          loading={generating}
          disabled={Boolean(blocked) || generating}
          onClick={onGenerate}
          leading={!generating ? <Sparkles className="w-4 h-4" /> : undefined}
        >
          {generating ? "Creating your look…" : "Put it on me"}
        </Button>
        {blocked && <p className="text-[13px] text-ink/65 text-center">{blocked}</p>}
        <Button block variant="secondary" onClick={onEditOutfit} disabled={generating}>
          Edit outfit
        </Button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- step 4: result */

function ResultStep({
  result,
  cached,
  selected,
  showingOriginal,
  selfieUrl,
  onZoom,
  onToggleOriginal,
  onRetry,
  generating,
  onEditOutfit,
  onNewLook,
  error,
}: {
  result: Result | null;
  cached: boolean;
  selected: Cloth[];
  showingOriginal: boolean;
  selfieUrl: string | null;
  onZoom: (src: string) => void;
  onToggleOriginal: () => void;
  onRetry: () => void;
  generating: boolean;
  onEditOutfit: () => void;
  onNewLook: () => void;
  error: string | null;
}) {
  if (!result) {
    return (
      <EmptyState
        icon={<Sparkles className="w-7 h-7" />}
        title="No look yet"
        body="Head back to Preview and tap “Put it on me”."
        action={{ label: "Back to preview", onClick: onEditOutfit }}
      />
    );
  }

  const src = showingOriginal && selfieUrl ? selfieUrl : result.imageUrl;

  return (
    <section className="surface p-4 sm:p-5 space-y-4">
      <div className="relative mx-auto w-full max-w-sm">
        <img
          src={src}
          alt={
            showingOriginal
              ? "Your original photo"
              : `You wearing ${selected.map((c) => c.name).join(", ")}`
          }
          className="w-full rounded-2xl object-cover bg-ink/[0.04]"
        />
        <button
          type="button"
          onClick={() => onZoom(src)}
          aria-label="View full size"
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/95 text-ink text-sm font-medium shadow-card backdrop-blur-sm"
        >
          <Zoom className="w-4 h-4" />
          Zoom
        </button>
        {cached && !showingOriginal && (
          <span className="absolute top-3 left-3">
            <Badge tone="sky">Reused earlier result</Badge>
          </span>
        )}
      </div>

      {error && <ErrorBanner onRetry={onRetry}>{error}</ErrorBanner>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onToggleOriginal}>
          {showingOriginal ? "Show the look" : "Show original"}
        </Button>
        <Button
          variant="secondary"
          onClick={onRetry}
          loading={generating}
          leading={!generating ? <Refresh className="w-4 h-4" /> : undefined}
        >
          Try again
        </Button>
        <Button variant="quiet" onClick={onEditOutfit}>
          Edit outfit
        </Button>
        <Button onClick={onNewLook}>New look</Button>
      </div>

      {selected.length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold text-ink/70 uppercase tracking-wide mb-2">
            What you're wearing
          </h2>
          <ul className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {selected.map((c) => (
              <li key={c.id} className="shrink-0 w-16">
                <img
                  src={c.imageUrl}
                  alt={c.name}
                  className="w-16 h-16 rounded-xl object-cover bg-ink/[0.05]"
                />
                <p className="text-[10px] text-ink/65 truncate mt-1">{c.name}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
