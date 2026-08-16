import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell, { PageTitle } from "../components/PageShell";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import ListingCard, { ListingCardSkeleton } from "../components/thrift/ListingCard";
import { Bookmark } from "../components/ui/icons";
import { useTryOn } from "../tryon";
import { canTryOn, listingAsCloth, thrift, type Listing } from "../thrift";

export default function SavedThrift() {
  const nav = useNavigate();
  const { toast } = useToast();
  const { tryOn } = useTryOn();
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    thrift
      .saved()
      .then((r) => setListings(r.listings))
      .catch(() => setListings([]));
  }, []);

  async function unsave(l: Listing) {
    // Removing from this page means removing from the list — there is nothing
    // left to show once it is unsaved.
    setListings((prev) => prev?.filter((x) => x.id !== l.id) ?? prev);
    try {
      await thrift.unsave(l.id);
    } catch {
      setListings((prev) => (prev ? [l, ...prev] : prev));
      toast("Could not update your saved items", { tone: "error" });
    }
  }

  return (
    <PageShell>
      <PageTitle title="Saved thrift items" subtitle="Pieces you're keeping an eye on." />

      {listings === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="w-7 h-7" />}
          title="Save pieces you love"
          body="Browse thrift finds that could complete your wardrobe."
          action={{ label: "Browse Thrift", onClick: () => nav("/thrift") }}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              onToggleSave={unsave}
              onTryOn={(x) => {
                if (!canTryOn(x)) {
                  toast("This piece is no longer available to try on", { tone: "error" });
                  return;
                }
                tryOn(listingAsCloth(x));
              }}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
