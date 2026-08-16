import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageShell, { PageTitle } from "../components/PageShell";
import Button from "../components/ui/Button";
import Sheet from "../components/ui/Sheet";
import Surface from "../components/ui/Surface";
import SectionHeading from "../components/ui/SectionHeading";
import EmptyState from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import CreateListingSheet from "../components/thrift/CreateListingSheet";
import { Chat, Plus, Tag } from "../components/ui/icons";
import { api, type Cloth } from "../api";
import {
  PAYMENT_NOTE,
  STATUS_LABEL,
  STATUS_TONE,
  formatPrice,
  thrift,
  type Listing,
  type ListingStatus,
  type SellerListing,
} from "../thrift";

const SECTIONS: { status: ListingStatus; title: string }[] = [
  { status: "draft", title: "Drafts" },
  { status: "active", title: "Active listings" },
  { status: "paused", title: "Paused listings" },
  { status: "sold", title: "Sold" },
];

export default function MyListings() {
  const { toast } = useToast();
  const confirm = useConfirm();

  const [listings, setListings] = useState<SellerListing[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [creatingFor, setCreatingFor] = useState<Cloth | null>(null);

  const load = useCallback(() => {
    thrift
      .mine()
      .then((r) => setListings(r.listings))
      .catch(() => setListings([]));
  }, []);

  useEffect(load, [load]);

  async function act(l: SellerListing, action: "pause" | "activate" | "sold" | "remove") {
    try {
      if (action === "pause") await thrift.pause(l.id);
      if (action === "activate") {
        // Bringing a sold piece back needs an explicit yes — the server asks
        // for it too, this just avoids a pointless round trip.
        if (l.status === "sold") {
          const ok = await confirm({
            title: "List this again?",
            body: `${l.title} is marked sold. Re-listing puts it back on the marketplace.`,
            confirmLabel: "Re-list",
          });
          if (!ok) return;
          await thrift.activate(l.id, true);
        } else {
          await thrift.activate(l.id);
        }
      }
      if (action === "sold") {
        const ok = await confirm({
          title: `Mark ${l.title} as sold?`,
          body: "It leaves the marketplace and its conversations become read-only. The piece stays in your wardrobe.",
          confirmLabel: "Mark sold",
        });
        if (!ok) return;
        await thrift.markSold(l.id);
      }
      if (action === "remove") {
        const ok = await confirm({
          title: `Remove ${l.title}?`,
          body: "The listing comes off the marketplace. Your wardrobe piece and photo are untouched.",
          confirmLabel: "Remove",
          tone: "danger",
        });
        if (!ok) return;
        await thrift.remove(l.id);
      }
      load();
    } catch (e: any) {
      toast(e?.message ?? "Could not update the listing", { tone: "error" });
    }
  }

  const grouped = SECTIONS.map((s) => ({
    ...s,
    items: (listings ?? []).filter((l) => l.status === s.status),
  })).filter((s) => s.items.length > 0);

  return (
    <PageShell>
      <PageTitle
        title="My thrift listings"
        subtitle="Everything you've put up for sale."
        action={
          <Button onClick={() => setPickerOpen(true)} leading={<Plus className="w-4 h-4" />}>
            List a piece
          </Button>
        }
      />

      {listings === null ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={<Tag className="w-7 h-7" />}
          title="Your thrift rack is empty"
          body="Open a piece in your wardrobe and choose Sell this piece."
          action={{ label: "List a piece from my wardrobe", onClick: () => setPickerOpen(true) }}
        />
      ) : (
        grouped.map((section) => (
          <section key={section.status} className="space-y-3">
            <SectionHeading title={section.title} as="h2" />
            <div className="space-y-3">
              {section.items.map((l) => (
                <Surface key={l.id} padded={false}>
                  <div className="flex gap-3 p-3">
                    <Link to={`/thrift/${l.id}`} className="shrink-0">
                      <img
                        src={l.imageUrl}
                        alt=""
                        loading="lazy"
                        className="w-20 h-24 rounded-xl object-cover bg-ink/[0.04]"
                      />
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/thrift/${l.id}`}
                          className="tap-44 text-[14.5px] font-semibold leading-tight hover:underline line-clamp-2"
                        >
                          {l.title}
                        </Link>
                        <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                      </div>

                      <p className="text-[15px] font-bold text-brand-700 mt-1">
                        {formatPrice(l.pricePaise)}
                      </p>

                      <p className="text-[12px] text-ink/60 mt-1">
                        Size {l.size} · {l.conversations} conversation
                        {l.conversations === 1 ? "" : "s"}
                        {l.unread > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-brand-700 font-semibold">
                            <Chat className="w-3.5 h-3.5" />
                            {l.unread} unread
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 px-3 pb-3 border-t border-ink/[0.06] pt-2.5">
                    <Action onClick={() => setEditing(l)}>Edit</Action>
                    {l.status === "active" && <Action onClick={() => act(l, "pause")}>Pause</Action>}
                    {(l.status === "paused" || l.status === "draft" || l.status === "sold") && (
                      <Action onClick={() => act(l, "activate")}>
                        {l.status === "sold" ? "Re-list" : "Activate"}
                      </Action>
                    )}
                    {l.status !== "sold" && (
                      <Action onClick={() => act(l, "sold")}>Mark sold</Action>
                    )}
                    <Action danger onClick={() => act(l, "remove")}>
                      Remove
                    </Action>
                  </div>
                </Surface>
              ))}
            </div>
          </section>
        ))
      )}

      <Surface tone="mint">
        <p className="text-[12.5px] leading-relaxed">{PAYMENT_NOTE}</p>
      </Surface>

      <WardrobePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(c) => {
          setPickerOpen(false);
          setCreatingFor(c);
        }}
      />

      <CreateListingSheet
        open={Boolean(creatingFor)}
        onClose={() => setCreatingFor(null)}
        cloth={creatingFor}
        onSaved={load}
      />

      <CreateListingSheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        existing={editing}
        onSaved={load}
      />
    </PageShell>
  );
}

function Action({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] px-3 rounded-full text-[13px] font-medium border transition-colors ${
        danger
          ? "border-coral/30 text-coral hover:bg-coral/10"
          : "border-ink/12 text-ink/75 hover:bg-brand-50 hover:text-brand-700"
      }`}
    >
      {children}
    </button>
  );
}

/** Choose which wardrobe piece to list. Pieces already listed are excluded. */
function WardrobePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: Cloth) => void;
}) {
  const [clothes, setClothes] = useState<Cloth[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setClothes(null);
    api
      .get<{ clothes: Cloth[] }>("/clothes")
      .then((r) => setClothes(r.clothes))
      .catch(() => setClothes([]));
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Which piece?" size="lg">
      {clothes === null ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : clothes.length === 0 ? (
        <p className="text-sm text-ink/65 text-center py-6">
          Your wardrobe is empty. Add a piece first, then come back to list it.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {clothes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="text-left rounded-xl overflow-hidden border border-ink/[0.08] hover:border-brand-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <img
                src={c.imageUrl}
                alt=""
                loading="lazy"
                className="w-full aspect-square object-cover bg-ink/[0.04]"
              />
              <span className="block text-[11.5px] font-medium px-1.5 py-1.5 truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
