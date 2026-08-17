import { useCallback, useEffect, useState } from "react";
import Sheet from "../ui/Sheet";
import Button from "../ui/Button";
import Surface from "../ui/Surface";
import { Badge } from "../ui/Chip";
import { useToast } from "../ui/Toast";
import { Check, Chat } from "../ui/icons";
import {
  NO_ESCROW_NOTE,
  formatPrice,
  thrift,
  type ConversationSummary,
  type Listing,
  type Sale,
} from "../../thrift";

/**
 * The sale flow, as the backend actually implements it: the seller records a
 * sale against a buyer who has messaged them, and that buyer confirms they
 * received the item. Both parties act; the second one completes it and the
 * garment moves between wardrobes.
 *
 * Every status shown here comes from the server. The component never decides
 * that a sale is done.
 */
export default function SalePanel({
  listing,
  isOwner,
  onTransferred,
}: {
  listing: Listing;
  isOwner: boolean;
  /** Fires after a completed transfer so the page can refetch. */
  onTransferred: () => void;
}) {
  const { toast } = useToast();
  const [sale, setSale] = useState<Sale | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    thrift
      .sales()
      .then((r) => {
        // Match on the listing's own title and image: the sales list carries
        // the listing snapshot rather than its id.
        setSale(
          r.transactions.find(
            (t) => t.listing.title === listing.title && t.listing.imageUrl === listing.imageUrl,
          ) ?? null,
        );
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [listing.title, listing.imageUrl]);

  useEffect(load, [load]);

  async function confirmReceived() {
    if (!sale || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await thrift.confirmReceived(sale.id);
      setConfirmOpen(false);
      toast("Purchase confirmed. This item has been added to your wardrobe.", { tone: "success" });
      setSale({ ...sale, status: r.status, completedAt: new Date().toISOString() });
      onTransferred();
    } catch (err: any) {
      setError(err?.message ?? "Could not confirm that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  /* ---------------------------------------------------------- completed */
  if (sale?.status === "completed") {
    return (
      <Surface tone="mint">
        <p className="flex items-start gap-2 text-[14px] leading-relaxed">
          <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700" />
          <span>
            {sale.role === "buyer"
              ? "Purchase confirmed. This item has been added to your wardrobe."
              : "Sale confirmed. This item has been transferred from your wardrobe."}
          </span>
        </p>
      </Surface>
    );
  }

  /* ------------------------------------------------------------- buyer */
  if (!isOwner) {
    if (!sale) {
      return (
        <Surface>
          <p className="text-[13.5px] text-ink/70 leading-relaxed">
            Message the seller to agree the sale. Once they record it here, you'll be able to
            confirm you received the item and it will move into your wardrobe.
          </p>
        </Surface>
      );
    }
    if (sale.status !== "pending") {
      return (
        <Surface tone="butter">
          <p className="text-[13.5px] leading-relaxed">This sale was {sale.status}.</p>
        </Surface>
      );
    }
    return (
      <>
        <Surface tone="lilac">
          <p className="text-[14px] font-semibold">The seller has recorded a sale to you</p>
          <p className="text-[13px] text-ink/70 leading-relaxed mt-1.5">
            Confirm once you have paid the seller and received the item. Confirming moves it into
            your wardrobe and cannot be undone.
          </p>
          <div className="mt-3">
            <Button block onClick={() => setConfirmOpen(true)}>
              I've purchased and received this
            </Button>
          </div>
        </Surface>

        <Sheet
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Confirm you received this"
          footer={
            <div className="space-y-2">
              <Button block size="lg" loading={busy} onClick={confirmReceived}>
                Yes, I received it
              </Button>
              <Button block variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>
                Not yet
              </Button>
            </div>
          }
        >
          <p className="text-[14px] leading-relaxed">
            Once you confirm, <strong>{listing.title}</strong> moves from the seller's wardrobe into
            yours.
          </p>
          <p className="text-[13px] text-ink/65 leading-relaxed mt-3 rounded-xl bg-ink/[0.035] px-3.5 py-2.5">
            {NO_ESCROW_NOTE}
          </p>
          {error && <p className="text-[13px] text-coral mt-2.5">{error}</p>}
        </Sheet>
      </>
    );
  }

  /* ------------------------------------------------------------ seller */
  if (sale?.status === "pending") {
    return (
      <Surface tone="butter">
        <p className="text-[14px] font-semibold">Waiting for the buyer to confirm</p>
        <p className="text-[13px] text-ink/70 leading-relaxed mt-1.5">
          You've recorded this sale. When the buyer confirms they received it, the piece leaves your
          wardrobe automatically.
        </p>
      </Surface>
    );
  }
  if (listing.status !== "active") return null;

  return (
    <>
      <Surface>
        <p className="text-[14px] font-semibold">Sold it?</p>
        <p className="text-[13px] text-ink/70 leading-relaxed mt-1.5">
          Record the sale against the buyer. They'll confirm receipt, and the piece will move to
          their wardrobe.
        </p>
        <div className="mt-3">
          <Button block variant="secondary" onClick={() => setPickOpen(true)}>
            Record a sale
          </Button>
        </div>
      </Surface>

      <BuyerPicker
        open={pickOpen}
        listing={listing}
        onClose={() => setPickOpen(false)}
        onRecorded={() => {
          setPickOpen(false);
          toast("Sale recorded. Waiting for the buyer to confirm.", { tone: "success" });
          load();
          onTransferred();
        }}
      />
    </>
  );
}

/** Choose which of the people who messaged about this piece bought it. */
function BuyerPicker({
  open,
  listing,
  onClose,
  onRecorded,
}: {
  open: boolean;
  listing: Listing;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [convs, setConvs] = useState<ConversationSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConvs(null);
    setError(null);
    thrift
      .conversations()
      .then((r) => setConvs(r.conversations.filter((c) => c.listing.id === listing.id)))
      .catch(() => setConvs([]));
  }, [open, listing.id]);

  async function record(buyerUserId: string) {
    setBusyId(buyerUserId);
    setError(null);
    try {
      await thrift.recordSale(listing.id, buyerUserId);
      onRecorded();
    } catch (err: any) {
      setError(err?.message ?? "Could not record that sale");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Who bought it?" size="lg">
      <p className="text-[13.5px] text-ink/70 leading-relaxed">
        Pick the buyer. Once they confirm they received it,{" "}
        <strong className="text-ink">{listing.title}</strong> leaves your wardrobe and joins theirs.
      </p>
      <p className="text-[13px] text-ink/65 leading-relaxed mt-3 rounded-xl bg-ink/[0.035] px-3.5 py-2.5">
        {NO_ESCROW_NOTE}
      </p>

      <div className="mt-4 space-y-2">
        {convs === null ? (
          <p className="text-[13px] text-ink/55 text-center py-4">Loading conversations…</p>
        ) : convs.length === 0 ? (
          <p className="text-[13px] text-ink/60 text-center py-4 leading-relaxed">
            Nobody has messaged you about this piece yet. A sale can only be recorded against
            someone you've spoken to here.
          </p>
        ) : (
          convs.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busyId !== null}
              onClick={() => record(c.otherUserId)}
              className="w-full min-h-[52px] flex items-center gap-3 rounded-xl border border-ink/12 px-3.5 py-2.5 text-left hover:bg-brand-50 hover:border-brand-300 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Chat className="w-4 h-4 text-ink/45 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium truncate">{c.otherName}</span>
                <span className="block text-[12px] text-ink/60 truncate">
                  {c.lastMessage ?? "No messages yet"}
                </span>
              </span>
              <Badge tone="lilac">{formatPrice(listing.pricePaise)}</Badge>
            </button>
          ))
        )}
      </div>

      {error && <p className="text-[13px] text-coral mt-3">{error}</p>}
    </Sheet>
  );
}
