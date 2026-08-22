import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import ProtectedPhoto from "../ui/ProtectedPhoto";

type Listing = {
  id: string;
  title: string;
  pricePaise: number;
  size: string;
  condition: string;
  city: string | null;
  status: string;
};

/**
 * A piece another member is selling, as referenced by the stylist.
 *
 * Loaded fresh rather than taken from the prompt: the model was told about
 * these listings when the reply began, and by the time anyone reads it one
 * may have sold. A card that quietly disappears is better than one that sends
 * somebody to a page that no longer exists.
 */
export default function ThriftChip({ id }: { id: string }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ listing: Listing }>(`/thrift/listings/${id}`)
      .then((r) => {
        if (cancelled) return;
        if (r.listing?.status === "active") setListing(r.listing);
        else setGone(true);
      })
      .catch(() => !cancelled && setGone(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (gone) return null;
  if (!listing) {
    return <div className="h-[76px] rounded-xl bg-ink/[0.04] animate-pulse my-1.5" aria-hidden />;
  }

  return (
    <Link
      to={`/thrift/${listing.id}`}
      className="my-1.5 flex items-center gap-3 rounded-xl border border-ink/[0.08] bg-white p-2.5 hover:bg-ink/[0.02] transition-colors"
    >
      <ProtectedPhoto
        scope="listing"
        id={listing.id}
        alt={listing.title}
        className="w-14 h-14 rounded-lg object-cover bg-ink/[0.05] shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold truncate">{listing.title}</span>
        <span className="block text-[12px] text-ink/60 mt-0.5">
          ₹{Math.round(listing.pricePaise / 100)} · size {listing.size} ·{" "}
          {listing.condition.replace(/_/g, " ")}
          {listing.city ? ` · ${listing.city}` : ""}
        </span>
      </span>
      <span className="text-[11px] font-semibold text-brand-700 shrink-0 pr-1">On Thrift</span>
    </Link>
  );
}
