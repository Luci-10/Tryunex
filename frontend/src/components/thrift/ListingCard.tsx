import { Link } from "react-router-dom";
import { Badge } from "../ui/Chip";
import { Bookmark, Sparkles } from "../ui/icons";
import ProtectedPhoto from "../ui/ProtectedPhoto";
import {
  CONDITION_LABEL,
  CONDITION_TONE,
  DELIVERY_LABEL,
  formatPrice,
  listedAgo,
  type Listing,
} from "../../thrift";

/**
 * Image-first browse card. The whole card is one link; the save and try-on
 * controls sit above it as siblings rather than nested buttons, because a
 * button inside an anchor is invalid and swallows keyboard activation.
 */
export default function ListingCard({
  listing,
  onToggleSave,
  onTryOn,
}: {
  listing: Listing;
  onToggleSave?: (l: Listing) => void;
  onTryOn?: (l: Listing) => void;
}) {
  const unavailable = listing.status !== "active";

  return (
    <div className="relative group">
      <Link
        to={`/thrift/${listing.id}`}
        className="block rounded-card border border-ink/[0.06] bg-white shadow-card overflow-hidden transition-shadow hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[4/5] bg-ink/[0.04]">
          <ProtectedPhoto
            scope="listing"
            id={listing.id}
            src={listing.imageUrl}
            alt={listing.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {unavailable && (
            <div className="absolute inset-0 bg-ink/55 grid place-items-center">
              <span className="text-white text-[13px] font-semibold">
                {listing.status === "sold" ? "Sold" : "Unavailable"}
              </span>
            </div>
          )}
          <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[13px] font-bold shadow-card">
            {formatPrice(listing.pricePaise)}
          </span>
        </div>

        <div className="p-3">
          <p className="text-[14px] font-semibold leading-tight line-clamp-2">{listing.title}</p>

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge tone={CONDITION_TONE[listing.condition]}>
              {CONDITION_LABEL[listing.condition]}
            </Badge>
            <Badge tone="ink">Size {listing.size}</Badge>
          </div>

          <p className="text-[11.5px] text-ink/60 mt-2">
            <span className="capitalize">{listing.category}</span> ·{" "}
            {DELIVERY_LABEL[listing.deliveryPreference]}
          </p>
          <p className="text-[11.5px] text-ink/55 mt-0.5">
            {listing.city ? `${listing.city} · ` : ""}
            {listedAgo(listing.createdAt)}
          </p>
        </div>
      </Link>

      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        {onToggleSave && (
          <button
            type="button"
            onClick={() => onToggleSave(listing)}
            aria-pressed={listing.saved}
            aria-label={listing.saved ? `Unsave ${listing.title}` : `Save ${listing.title}`}
            className={`w-9 h-9 rounded-full grid place-items-center shadow-card transition-colors ${
              listing.saved ? "bg-brand-500 text-white" : "bg-white/95 text-ink/70 hover:text-brand-700"
            }`}
          >
            <Bookmark className="w-[18px] h-[18px]" fill={listing.saved ? "currentColor" : "none"} />
          </button>
        )}
        {onTryOn && !unavailable && (
          <button
            type="button"
            onClick={() => onTryOn(listing)}
            aria-label={`Try ${listing.title} with my wardrobe`}
            className="w-9 h-9 rounded-full grid place-items-center bg-white/95 text-ink/70 shadow-card hover:text-brand-700 transition-colors"
          >
            <Sparkles className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Matches the card footprint so the grid doesn't reflow while loading. */
export function ListingCardSkeleton() {
  return (
    <div className="rounded-card border border-ink/[0.06] bg-white overflow-hidden">
      <div className="aspect-[4/5] shimmer bg-ink/[0.06]" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-3/4 rounded shimmer bg-ink/[0.06]" />
        <div className="h-2.5 w-1/2 rounded shimmer bg-ink/[0.06]" />
      </div>
    </div>
  );
}
