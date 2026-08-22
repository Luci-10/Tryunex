import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import Lightbox from "../components/Lightbox";
import PhotoAccessPrompt from "../components/PhotoAccessPrompt";
import AddClothModal from "../components/AddClothModal";
import Button from "../components/ui/Button";
import Sheet from "../components/ui/Sheet";
import { Badge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import WardrobePicker, { type PickerItem } from "../components/tryon/WardrobePicker";
import SelectedLook from "../components/tryon/SelectedLook";
import { Camera, Download, Refresh, Share, Sparkles, Zoom } from "../components/ui/icons";
import ProtectedPhoto, { type MediaScope } from "../components/ui/ProtectedPhoto";
import { api, type Cloth } from "../api";
import { useTryOn, roleOf, ROLE_OPTIONS, SLOT_LABEL, type AddOutcome, type Role } from "../tryon";
import { hasPhotoConsent, grantPhotoConsent } from "../photoConsent";
import { nativePickerAvailable, pickPhotoNatively, type PickSource } from "../photoPicker";
import { optimizeForTryOn, putWithProgress } from "../upload";
import { costLabel, creditsForItems, TRYON_DISCLAIMER, PHOTO_TIP } from "../tryonCost";
import { downloadLook, shareLook } from "../share";
import { getSummary, type CreditBalance } from "../billing";

type Selfie = { id: string; imageUrl: string; createdAt: string };
type Result = { id: string; imageUrl: string; createdAt: string; clothId: string | null };
type GenerateResponse = {
  result: Result;
  cached: boolean;
  regenerated?: boolean;
  creditUsed?: boolean;
  credits?: CreditBalance;
};

const DISCLAIMER =
  "Virtual try-on is a styling preview. Fit, sizing, fabric drape and colour may not be exact. Choose sizes using your own measurements and the brand's size guide.";

const PHOTO_GUIDANCE =
  "For the best preview, use a clear, front-facing photo in fitted clothing so the AI can read the garment fit and body outline.";

export default function Tryon() {
  const { selection, select, commit, clear, locked, setLocked, roles, setRole } = useTryOn();
  const { toast } = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();

  const [tab, setTab] = useState<"selected" | "wardrobe">("selected");
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
  const [resultOf, setResultOf] = useState<Cloth[]>([]);
  const [cached, setCached] = useState(false);
  const [showingOriginal, setShowingOriginal] = useState(false);

  // Zoom targets a record now, not a URL — the image is private.
  const [zoom, setZoom] = useState<{ scope: MediaScope; id: string } | null>(null);
  const [askPhoto, setAskPhoto] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<{ cloth: Cloth; outcome: AddOutcome } | null>(null);
  const [sharing, setSharing] = useState<"download" | "share" | null>(null);
  const [lastForced, setLastForced] = useState(false);
  const [classifying, setClassifying] = useState<Cloth | null>(null);
  const [rememberRole, setRememberRole] = useState(false);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const wardrobeRef = useRef<HTMLDivElement>(null);

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

      // Friends' clothes appear only where that friend opted into try-on.
      const friends = shares.shares.filter((f) => f.allowTryon);
      const friendClothes = await Promise.all(
        friends.map((f) =>
          api
            .get<{ clothes: Cloth[] }>(`/friends/${f.ownerId}/wardrobe`)
            .then((r) => r.clothes.map((c) => ({ ...c, ownerName: f.ownerName })))
            .catch(() => [] as PickerItem[]),
        ),
      );
      setItems([...mine.clothes, ...friendClothes.flat()]);
      // Balance is always the server's number; nothing here is authoritative.
      getSummary()
        .then((sum) => setCredits(sum.credits))
        .catch(() => setCredits(null));
    } catch (err: any) {
      setLoadError(err?.message ?? "Could not load the studio");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  useEffect(() => setLocked(generating), [generating, setLocked]);

  // --- selection ------------------------------------------------------
  const handlePick = useCallback(
    (cloth: Cloth) => {
      const outcome = select(cloth);
      if (outcome.status === "blocked") {
        toast(outcome.message, { tone: "error" });
        return;
      }
      // `other` has no meaningful slot, so ask what part it plays here.
      if (outcome.status === "needs-role") {
        setRememberRole(false);
        setClassifying(cloth);
        return;
      }
      if (outcome.status === "needs-confirm") setPending({ cloth, outcome });
    },
    [select, toast],
  );

  function chooseRole(role: Role) {
    const cloth = classifying;
    if (!cloth) return;
    setRole(cloth.id, role, rememberRole);
    setClassifying(null);
    setRememberRole(false);
    // Now that it has a role, run it back through the normal rules.
    const outcome = select(cloth);
    if (outcome.status === "blocked") toast(outcome.message, { tone: "error" });
    else if (outcome.status === "needs-confirm") setPending({ cloth, outcome });
  }

  function changeRole(cloth: Cloth) {
    setRememberRole(false);
    setClassifying(cloth);
  }

  async function resolvePending(accept: boolean) {
    const p = pending;
    setPending(null);
    if (!p || !accept || p.outcome.status !== "needs-confirm") return;
    commit(p.cloth, p.outcome.removes);
    if (p.outcome.removes.length > 0) {
      toast(`${p.outcome.removes.map((r) => r.name).join(", ")} removed from your look`);
    }
  }

  // --- selfie ---------------------------------------------------------
  function openWebPicker(source: PickSource = "gallery") {
    if (source === "camera") cameraRef.current?.click();
    else fileRef.current?.click();
  }

  async function startPick(source: PickSource = "gallery") {
    setUploadError(null);
    if (nativePickerAvailable()) {
      const r = await pickPhotoNatively(source);
      if (r.ok) return uploadSelfie(r.file);
      if (r.reason === "cancelled") return;
      if (r.reason === "unavailable") return openWebPicker(source);
      return setUploadError(r.message);
    }
    openWebPicker(source);
  }

  function requestPhoto() {
    setAskPhoto(true);
  }

  function continueFromPrompt(source: PickSource) {
    grantPhotoConsent();
    setAskPhoto(false);
    setTimeout(() => startPick(source), 60);
  }

  async function uploadSelfie(file: File) {
    setUploadError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      // Long edge 1024 at q0.91: a 768x1024 portrait is 0.79MP, just under
      // the megapixel the provider recommends, with fabric and face detail
      // intact. EXIF orientation is applied so portraits aren't sideways.
      const resized = await optimizeForTryOn(file);
      const { uploadUrl, publicUrl } = await api.post<{ uploadUrl: string; publicUrl: string }>(
        "/tryon/selfie/upload-url",
        {},
      );
      await putWithProgress(uploadUrl, resized, "image/jpeg", setUploadProgress);
      const r = await api.post<{ selfie: Selfie }>("/tryon/selfie", { imageUrl: publicUrl });
      setSelfie(r.selfie);
      setResult(null);
      setShowingOriginal(false);
      setAnnouncement("Photo saved.");
      toast("Photo saved", { tone: "success" });
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  // --- generate -------------------------------------------------------
  async function generate(force = false) {
    if (generating) return; // hard guard against double submits
    if (!selfie) {
      setGenError("Add your photo first.");
      return;
    }
    if (selection.length === 0) {
      setGenError("Pick at least one piece to wear.");
      return;
    }
    // Don't spend a round trip when the server has already told us it's zero.
    if (credits && credits.total <= 0) {
      setOutOfCredits(true);
      return;
    }
    setGenError(null);
    setGenerating(true);
    setLastForced(force);
    setAnnouncement(
      force
        ? "Creating a new variation. This usually takes 5 to 15 seconds."
        : "Creating your look. This usually takes 5 to 15 seconds.",
    );
    try {
      // Send the role for anything filed under `other` so the prompt places
      // it correctly instead of guessing from a meaningless category.
      const roleMap: Record<string, string> = {};
      for (const c of selection) {
        const r = roleOf(c, roles);
        if (r && r !== c.category) roleMap[c.id] = r;
      }
      const r = await api.post<GenerateResponse>("/tryon/generate", {
        clothIds: selection.map((c) => c.id),
        ...(Object.keys(roleMap).length ? { roles: roleMap } : {}),
        ...(force ? { forceRegenerate: true } : {}),
      });
      setResult(r.result);
      setResultOf(selection);
      // A forced run is never a cache hit, so the badge must never show.
      setCached(force ? false : r.cached);
      if (r.credits) setCredits(r.credits);
      setShowingOriginal(false);
      setAnnouncement(force ? "New variation ready." : "Your look is ready.");
    } catch (err: any) {
      // The existing result stays on screen — a failed variation shouldn't
      // cost the user the look they already had.
      // 402 carries the balance and means nothing was charged.
      if (err?.code === "NO_TRYON_CREDITS" || /out of Try-on credits/i.test(String(err?.message))) {
        if (err?.credits) setCredits(err.credits);
        setOutOfCredits(true);
        setAnnouncement("You're out of Try-on credits.");
        return;
      }
      // These three refuse before any credit is taken.
      if (
        err?.code === "GENERATION_DISABLED" ||
        err?.code === "GENERATION_RATE_LIMIT" ||
        err?.code === "GENERATION_IN_PROGRESS"
      ) {
        setGenError(err.message ?? "Try again in a moment. No credit was used.");
        setAnnouncement(err.message ?? "");
        return;
      }
      const msg = err?.message ?? "Could not create your look";
      setGenError(msg);
      // The backend refunds on failure, so re-read rather than guess.
      getSummary().then((sum) => setCredits(sum.credits)).catch(() => {});
      setAnnouncement(`Try-on failed. ${msg}`);
    } finally {
      setGenerating(false);
    }
  }

  async function startNewLook() {
    if (selection.length > 0) {
      const ok = await confirm({
        title: "Start a new look?",
        body: "Your selected pieces are cleared. Your photo stays.",
        confirmLabel: "Start new",
      });
      if (!ok) return;
    }
    clear();
    setResult(null);
    setCached(false);
    setGenError(null);
    setShowingOriginal(false);
    setTab("wardrobe");
  }

  function goToWardrobe() {
    setTab("wardrobe");
    wardrobeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveLook() {
    if (!result || sharing) return;
    setSharing("download");
    const r = await downloadLook("tryon", result.id);
    setSharing(null);
    if (r.ok) {
      const said =
        r.via === "newtab"
          ? "Opened the image — long-press or right-click to save"
          : r.via === "gallery"
            ? "Saved to your photos"
            : r.via === "share"
              ? "Shared"
              : "Saved to your device";
      toast(said, { tone: "success" });
    } else if (!("cancelled" in r)) {
      toast(r.message, { tone: "error" });
    }
  }

  async function shareResult() {
    if (!result || sharing) return;
    setSharing("share");
    const r = await shareLook("tryon", result.id);
    setSharing(null);
    if (r.ok) {
      if (r.via === "clipboard") {
        toast("Link copied — anyone with it can view this image", { tone: "success" });
      } else if (r.via === "share") {
        toast("Shared", { tone: "success" });
      }
    } else if (!("cancelled" in r)) {
      toast(r.message, { tone: "error" });
    }
  }

  function onAdded(c: Cloth) {
    setItems((p) => [c, ...p]);
    toast(`${c.name} added to your wardrobe`, { tone: "success" });
  }

  const heroSrc = result && !showingOriginal ? result.imageUrl : selfie?.imageUrl ?? null;
  const canGenerate = Boolean(selfie) && selection.length > 0 && !generating;
  const blockedReason = !selfie
    ? "Add your photo to generate a preview."
    : selection.length === 0
      ? "Pick at least one piece."
      : null;

  const wardrobeCount = useMemo(() => items.length, [items]);

  return (
    <PageShell width="wide">
      <Lightbox
        scope={zoom?.scope}
        id={zoom?.id}
        alt="Your try-on look"
        onClose={() => setZoom(null)}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Try-on Studio</h1>
          <p className="text-sm text-ink/65 mt-1">Your photo, your clothes, one look at a time.</p>
        </div>
        {(selection.length > 0 || result) && (
          <Button variant="secondary" size="sm" onClick={startNewLook} disabled={generating}>
            New look
          </Button>
        )}
      </div>

      {loadError && <ErrorBanner onRetry={() => load()}>{loadError}</ErrorBanner>}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:items-start">
        {/* ---------------------------------------------- photo / result */}
        <section className="space-y-3 lg:sticky lg:top-20">
          <h2 className="text-[13px] font-semibold text-ink/65 uppercase tracking-wide">
            {result ? "Result" : "Your photo"}
          </h2>

          <div className="surface p-3 sm:p-4 space-y-3">
            <div className="relative mx-auto w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden bg-lilac border border-brand-200/60">
              {loading ? (
                <Skeleton className="w-full h-full rounded-none" />
              ) : generating ? (
                <div className="absolute inset-0 grid place-items-center shimmer">
                  {selfie && (
                    <ProtectedPhoto
                      scope="selfie"
                      id={selfie.id}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-30"
                    />
                  )}
                  <div className="relative text-center px-6">
                    <Sparkles className="w-8 h-8 mx-auto text-brand-600" />
                    <p className="font-semibold text-sm mt-3">Creating your look…</p>
                    <p className="text-[13px] text-ink/65 mt-1">Usually takes 5–15 seconds.</p>
                  </div>
                </div>
              ) : heroSrc ? (
                <ProtectedPhoto
                  scope={result && !showingOriginal ? "tryon" : "selfie"}
                  id={(result && !showingOriginal ? result.id : selfie?.id) || ""}
                  src={heroSrc}
                  alt={
                    result && !showingOriginal
                      ? `You wearing ${resultOf.map((c) => c.name).join(", ")}`
                      : "Your try-on photo"
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <button
                  type="button"
                  onClick={requestPhoto}
                  className="w-full h-full flex flex-col items-center justify-center gap-2 text-brand-700"
                >
                  <Camera className="w-9 h-9" />
                  <span className="text-sm font-semibold">Add your photo</span>
                  <span className="text-xs text-ink/60">Tap to choose or take one</span>
                </button>
              )}

              {cached && result && !showingOriginal && !generating && (
                <span className="absolute top-3 left-3">
                  <Badge tone="sky">Already generated · no credit used</Badge>
                </span>
              )}

              {heroSrc && !generating && (
                <button
                  type="button"
                  onClick={() =>
                    setZoom(
                      result && !showingOriginal
                        ? { scope: "tryon", id: result.id }
                        : selfie
                          ? { scope: "selfie", id: selfie.id }
                          : null,
                    )
                  }
                  aria-label="View full size"
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/95 text-ink text-sm font-medium shadow-card backdrop-blur-sm"
                >
                  <Zoom className="w-4 h-4" />
                  Zoom
                </button>
              )}

              {uploading && uploadProgress !== null && (
                <div className="absolute inset-x-0 bottom-0 bg-ink/70 px-4 py-3 backdrop-blur-sm">
                  <div className="flex items-center justify-between text-white text-xs font-medium mb-1.5">
                    <span>Uploading your photo…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-white/25 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={uploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Photo upload progress"
                  >
                    <div
                      className="h-full bg-white transition-[width] duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {uploadError && <ErrorBanner onRetry={requestPhoto}>{uploadError}</ErrorBanner>}

            {result ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={saveLook}
                    loading={sharing === "download"}
                    disabled={Boolean(sharing) || generating}
                    leading={sharing !== "download" ? <Download className="w-4 h-4" /> : undefined}
                  >
                    Save image
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={shareResult}
                    loading={sharing === "share"}
                    disabled={Boolean(sharing) || generating}
                    leading={sharing !== "share" ? <Share className="w-4 h-4" /> : undefined}
                  >
                    Share
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => generate(true)}
                    loading={generating}
                    disabled={generating}
                    leading={!generating ? <Refresh className="w-4 h-4" /> : undefined}
                  >
                    {`Regenerate new variation · ${creditsForItems(selection.length)} credit${creditsForItems(selection.length) === 1 ? "" : "s"}`}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowingOriginal((v) => !v)}>
                    {showingOriginal ? "Show the look" : "Show original"}
                  </Button>
                  <Button variant="quiet" onClick={goToWardrobe} disabled={generating}>
                    Edit outfit
                  </Button>
                  <Button variant="quiet" onClick={startNewLook} disabled={generating}>
                    Start new look
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {selfie && !generating && (
                  <Button
                    variant="secondary"
                    block
                    onClick={requestPhoto}
                    disabled={uploading}
                    leading={<Camera className="w-4 h-4" />}
                  >
                    Replace photo
                  </Button>
                )}
                <p className="text-[12.5px] text-ink/65 leading-relaxed text-center">
                  {PHOTO_GUIDANCE}
                </p>
              </>
            )}

            {genError && <ErrorBanner onRetry={() => generate(lastForced)}>{genError}</ErrorBanner>}

            {result && (
              <p className="text-[12px] text-ink/60 leading-relaxed">
                Creates a new AI variation using your original photo and selected clothes. Each run
                is generated from scratch, so the result may differ.
              </p>
            )}
          </div>

          {result && resultOf.length > 0 && (
            <div className="surface p-3">
              <h3 className="text-[12px] font-semibold text-ink/65 uppercase tracking-wide mb-2">
                What created this look
              </h3>
              <SelectedLook compact onPickClothes={goToWardrobe} />
            </div>
          )}

          <p className="text-[11.5px] text-ink/60 leading-relaxed px-1">{DISCLAIMER}</p>
        </section>

        {/* ------------------------------------------- selected + picker */}
        <div className="mt-5 lg:mt-0 space-y-4" ref={wardrobeRef}>
          {/* Phone tabs. On desktop both panels are simply stacked. */}
          <div
            role="tablist"
            aria-label="Outfit"
            className="lg:hidden sticky top-14 z-20 -mx-4 px-4 py-2 bg-canvas/90 backdrop-blur-md flex gap-1.5"
          >
            <TabButton
              active={tab === "selected"}
              onClick={() => setTab("selected")}
              id="tab-selected"
              controls="panel-selected"
            >
              Selected
              {selection.length > 0 && (
                <span className="ml-1.5 px-1.5 rounded-full bg-brand-500 text-white text-[10px] leading-4">
                  {selection.length}
                </span>
              )}
            </TabButton>
            <TabButton
              active={tab === "wardrobe"}
              onClick={() => setTab("wardrobe")}
              id="tab-wardrobe"
              controls="panel-wardrobe"
            >
              Wardrobe
              <span className="ml-1.5 text-ink/40">{wardrobeCount}</span>
            </TabButton>
          </div>

          <section
            id="panel-selected"
            role="tabpanel"
            aria-labelledby="tab-selected"
            className={tab === "selected" ? "" : "hidden lg:block"}
          >
            <h2 className="hidden lg:block text-[13px] font-semibold text-ink/65 uppercase tracking-wide mb-2">
              Selected look
            </h2>
            <div className="surface p-3 sm:p-4">
              <SelectedLook onPickClothes={goToWardrobe} onChangeRole={changeRole} />
            </div>
          </section>

          <section
            id="panel-wardrobe"
            role="tabpanel"
            aria-labelledby="tab-wardrobe"
            className={tab === "wardrobe" ? "" : "hidden lg:block"}
          >
            <h2 className="hidden lg:block text-[13px] font-semibold text-ink/65 uppercase tracking-wide mb-2">
              Pick clothes
            </h2>
            <WardrobePicker
              items={items}
              loading={loading}
              onPick={handlePick}
              onAdd={() => setAddOpen(true)}
            />
          </section>
        </div>
      </div>

      {/* Generate stays reachable above the tab bar and the home indicator. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-20 pt-2">
        <div className="rounded-2xl bg-white/95 backdrop-blur border border-ink/[0.08] shadow-lift p-2.5">
          <Button
            block
            size="lg"
            loading={generating}
            disabled={!canGenerate}
            onClick={() => generate()}
            leading={!generating ? <Sparkles className="w-4 h-4" /> : undefined}
          >
            {generating
              ? "Creating your look…"
              : selection.length > 0
                ? `Put it on me · ${creditsForItems(selection.length)} credit${
                    creditsForItems(selection.length) === 1 ? "" : "s"
                  }`
                : "Put it on me"}
          </Button>
          {blockedReason && !generating && (
            <p className="text-[12px] text-ink/60 text-center mt-1.5">{blockedReason}</p>
          )}
          {!blockedReason && !generating && selection.length > 0 && (
            <p className="text-[12px] text-ink/70 text-center mt-1.5 font-medium">
              {costLabel(selection.length)}
              {credits ? ` · ${credits.total} left` : ""}
            </p>
          )}
          {!blockedReason && !generating && selection.length === 0 && credits && (
            <p className="text-[12px] text-ink/60 text-center mt-1.5">
              {credits.total} Try-on credit{credits.total === 1 ? "" : "s"} left · cached looks are
              free
            </p>
          )}
          <p className="text-[11.5px] text-ink/55 text-center mt-1.5 leading-snug px-1">
            {TRYON_DISCLAIMER}
          </p>
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
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadSelfie(f);
          e.target.value = "";
        }}
      />
      {!selfie && !uploading && (
        <p className="text-[12px] text-ink/60 leading-relaxed text-center px-2">{PHOTO_TIP}</p>
      )}
      <PhotoAccessPrompt
        open={askPhoto}
        onCancel={() => setAskPhoto(false)}
        onContinue={continueFromPrompt}
      />

      <AddClothModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={onAdded} />

      <Sheet
        open={outOfCredits}
        onClose={() => setOutOfCredits(false)}
        title="Not enough Try-on credits"
        footer={
          <div className="space-y-2">
            <Button block size="lg" onClick={() => nav("/plans")}>
              Buy credits
            </Button>
            <Button block variant="secondary" onClick={() => nav("/plans")}>
              View plans
            </Button>
            <Button block variant="quiet" onClick={() => setOutOfCredits(false)}>
              Not now
            </Button>
          </div>
        }
      >
        <div className="rounded-xl bg-ink/[0.035] px-3.5 py-3 grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink/55">You have</p>
            <p className="text-[19px] font-bold mt-0.5">{credits?.total ?? 0}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink/55">This look needs</p>
            <p className="text-[19px] font-bold mt-0.5 text-brand-700">
              {creditsForItems(selection.length)}
            </p>
          </div>
        </div>
        <p className="text-sm text-ink/75 leading-relaxed mt-3">
          Nothing was charged. Get more looks with a pack, or choose a monthly plan with unlimited
          AI styling chat.
        </p>
        <p className="text-[13px] text-ink/65 leading-relaxed mt-2">
          Your wardrobe, planning, sharing and history all keep working, and looks you've already
          generated stay free to revisit.
        </p>
      </Sheet>

      {/* `other` garments declare the part they play, for this look only —
          the wardrobe category is never rewritten. */}
      <Sheet
        open={classifying !== null}
        onClose={() => setClassifying(null)}
        title="Classify for this look"
        description={classifying ? `${classifying.name} is filed under Other.` : undefined}
      >
        <p className="text-sm text-ink/75 leading-relaxed">
          What role does this piece play in this outfit?
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => chooseRole(r)}
              className="h-12 rounded-xl border border-ink/12 bg-white text-[14px] font-medium hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 active:bg-brand-100 transition-colors"
            >
              {SLOT_LABEL[r]}
            </button>
          ))}
        </div>
        <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberRole}
            onChange={(e) => setRememberRole(e.target.checked)}
            className="w-5 h-5 accent-brand-500 mt-0.5 shrink-0"
          />
          <span className="text-[13px] text-ink/70 leading-snug">
            Use this role by default in Try-on. You can change it any time from the selected
            list — your wardrobe category stays Other.
          </span>
        </label>
      </Sheet>

      {/* Nothing leaves the look without the user agreeing to it. */}
      <Sheet
        open={pending !== null}
        onClose={() => resolvePending(false)}
        title={pending?.outcome.status === "needs-confirm" && pending.outcome.kind === "layer"
          ? "Layer this on top?"
          : "Swap this piece?"}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => resolvePending(false)}>
              Keep as is
            </Button>
            <Button block onClick={() => resolvePending(true)}>
              {pending?.outcome.status === "needs-confirm" && pending.outcome.kind === "layer"
                ? "Layer it"
                : "Replace"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink/75 leading-relaxed">
          {pending?.outcome.status === "needs-confirm" ? pending.outcome.message : ""}
        </p>
      </Sheet>
    </PageShell>
  );
}

function TabButton({
  active,
  onClick,
  id,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`flex-1 h-10 rounded-full text-[13.5px] transition-colors ${
        active
          ? "bg-brand-500 text-white font-semibold"
          : "bg-white text-ink/70 border border-ink/10"
      }`}
    >
      {children}
    </button>
  );
}
