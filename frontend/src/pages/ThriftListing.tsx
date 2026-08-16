import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import Button from "../components/ui/Button";
import Surface from "../components/ui/Surface";
import { Badge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { ErrorBanner } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import ReportSheet from "../components/thrift/ReportSheet";
import { Avatar } from "../components/Nav";
import { Block, Bookmark, Chat, ChevronLeft, Flag, Sparkles } from "../components/ui/icons";
import { useTryOn } from "../tryon";
import { styleTagOf } from "../styleTags";
import {
  CONDITION_LABEL,
  CONDITION_TONE,
  DELIVERY_LABEL,
  LISTING_REPORT_REASONS,
  PAYMENT_NOTE,
  canTryOn,
  formatPrice,
  listedOn,
  listingAsCloth,
  thrift,
  type Listing,
} from "../thrift";

export default function ThriftListing() {
  const { listingId } = useParams<{ listingId: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { tryOn } = useTryOn();

  const [listing, setListing] = useState<Listing | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    setListing(null);
    setError(null);
    thrift
      .detail(listingId)
      .then((r) => {
        setListing(r.listing);
        setIsOwner(r.isOwner);
        setConversationId(r.conversationId);
      })
      .catch((e) => setError(e?.message ?? "Could not load this listing"));
  }, [listingId]);

  const unavailable = listing ? listing.status !== "active" : false;

  async function toggleSave() {
    if (!listing) return;
    const next = !listing.saved;
    setListing({ ...listing, saved: next });
    try {
      await (next ? thrift.save(listing.id) : thrift.unsave(listing.id));
    } catch {
      setListing({ ...listing, saved: !next });
      toast("Could not update your saved items", { tone: "error" });
    }
  }

  async function messageSeller() {
    if (!listing || busy) return;
    setBusy(true);
    try {
      const r = await thrift.startConversation(listing.id);
      nav(`/thrift/messages/${r.conversationId}`);
    } catch (e: any) {
      toast(e?.message ?? "Could not open a conversation", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function tryWithWardrobe() {
    if (!listing) return;
    if (!canTryOn(listing)) {
      toast("This piece is no longer available to try on", { tone: "error" });
      return;
    }
    tryOn(listingAsCloth(listing));
  }

  async function blockSeller() {
    if (!listing) return;
    const ok = await confirm({
      title: `Block ${listing.sellerName}?`,
      body: "You won't see their listings and neither of you can start new conversations. Existing chats become read-only.",
      confirmLabel: "Block",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await thrift.block(listing.sellerUserId);
      toast("Blocked", { tone: "success" });
      nav("/thrift");
    } catch (e: any) {
      toast(e?.message ?? "Could not block this user", { tone: "error" });
    }
  }

  if (error) {
    return (
      <PageShell width="narrow">
        <BackLink />
        <ErrorBanner onRetry={() => listingId && thrift.detail(listingId).then((r) => setListing(r.listing))}>
          {error}
        </ErrorBanner>
      </PageShell>
    );
  }

  if (!listing) {
    return (
      <PageShell width="narrow">
        <BackLink />
        <Skeleton className="aspect-[4/5] rounded-card" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-20" />
      </PageShell>
    );
  }

  const style = listing.styleTag ? styleTagOf(listing.styleTag) : null;

  return (
    <PageShell width="narrow">
      <BackLink />

      <div className="relative rounded-card overflow-hidden bg-ink/[0.04] border border-ink/[0.06]">
        <img
          src={listing.imageUrl}
          alt={listing.title}
          className="w-full aspect-[4/5] max-h-[70vh] object-cover"
        />
        {unavailable && (
          <div className="absolute inset-0 bg-ink/55 grid place-items-center">
            <span className="rounded-full bg-white/95 px-4 py-2 text-[14px] font-bold">
              {listing.status === "sold" ? "Sold" : "No longer available"}
            </span>
          </div>
        )}
      </div>

      <div>
        <h1 className="text-[22px] font-bold tracking-tight leading-tight">{listing.title}</h1>
        <p className="text-[24px] font-bold text-brand-700 mt-1">{formatPrice(listing.pricePaise)}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone={CONDITION_TONE[listing.condition]}>{CONDITION_LABEL[listing.condition]}</Badge>
        <Badge tone="ink">Size {listing.size}</Badge>
        <Badge tone="ink" className="capitalize">{listing.category}</Badge>
        {style && <Badge tone="lilac">{style.label}</Badge>}
        {listing.brand && <Badge tone="sky">{listing.brand}</Badge>}
      </div>

      {unavailable && (
        <Surface tone="butter">
          <p className="text-[13.5px] leading-relaxed">
            {listing.status === "sold"
              ? "This item has been sold."
              : listing.status === "paused"
                ? "This listing is currently unavailable."
                : "This listing is no longer available."}
          </p>
        </Surface>
      )}

      {listing.description && (
        <Surface>
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{listing.description}</p>
        </Surface>
      )}

      <Surface padded={false}>
        <dl className="divide-y divide-ink/[0.06]">
          <Row label="Delivery" value={DELIVERY_LABEL[listing.deliveryPreference]} />
          {listing.city && <Row label="Seller city" value={listing.city} />}
          <Row label="Listed" value={listedOn(listing.createdAt)} />
        </dl>
      </Surface>

      <Surface>
        <div className="flex items-center gap-3">
          <Avatar name={listing.sellerName} />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold truncate">{listing.sellerName}</p>
            <p className="text-[12px] text-ink/60">Seller on TryUnex</p>
          </div>
        </div>
      </Surface>

      {/* ------------------------------------------------------ buyer actions */}
      {isOwner ? (
        <Surface tone="lilac">
          <p className="text-[13.5px] leading-relaxed">
            This is your listing. Manage it from{" "}
            <Link to="/my-listings" className="font-semibold text-brand-700 underline underline-offset-2">
              My thrift listings
            </Link>
            .
          </p>
        </Surface>
      ) : (
        <div className="space-y-2">
          <Button
            block
            size="lg"
            loading={busy}
            disabled={unavailable}
            onClick={messageSeller}
            leading={<Chat className="w-4 h-4" />}
          >
            {conversationId ? "Open conversation" : "Message seller"}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={toggleSave}
              leading={<Bookmark className="w-4 h-4" fill={listing.saved ? "currentColor" : "none"} />}
            >
              {listing.saved ? "Saved" : "Save item"}
            </Button>
            <Button
              variant="secondary"
              disabled={unavailable}
              onClick={tryWithWardrobe}
              leading={<Sparkles className="w-4 h-4" />}
            >
              Try with my wardrobe
            </Button>
          </div>

          {!unavailable && (
            <p className="text-[12px] text-ink/60 text-center leading-relaxed">
              Preview this pre-loved piece with your wardrobe before messaging the seller.
            </p>
          )}
        </div>
      )}

      <Surface tone="mint">
        <p className="text-[12.5px] leading-relaxed">{PAYMENT_NOTE}</p>
      </Surface>

      {!isOwner && (
        <div className="flex flex-wrap gap-2 justify-center pt-1">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="tap-44 inline-flex items-center gap-1.5 text-[13px] text-ink/60 hover:text-ink px-2"
          >
            <Flag className="w-4 h-4" />
            Report listing
          </button>
          <button
            type="button"
            onClick={blockSeller}
            className="tap-44 inline-flex items-center gap-1.5 text-[13px] text-ink/60 hover:text-coral px-2"
          >
            <Block className="w-4 h-4" />
            Block seller
          </button>
        </div>
      )}

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report this listing"
        reasons={LISTING_REPORT_REASONS}
        onSubmit={(reason, note) => thrift.reportListing(listing.id, reason, note).then(() => {})}
      />
    </PageShell>
  );
}

function BackLink() {
  return (
    <Link
      to="/thrift"
      className="tap-44 inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-700 hover:underline"
    >
      <ChevronLeft className="w-4 h-4" />
      Back to Thrift
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-[13px] text-ink/60">{label}</dt>
      <dd className="text-[13.5px] font-medium text-right">{value}</dd>
    </div>
  );
}
