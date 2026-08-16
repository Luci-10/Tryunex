import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell, { PageTitle } from "../components/PageShell";
import Button from "../components/ui/Button";
import Sheet from "../components/ui/Sheet";
import EmptyState from "../components/ui/EmptyState";
import { FilterChip } from "../components/ui/Chip";
import { Input, Label, Select } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import ListingCard, { ListingCardSkeleton } from "../components/thrift/ListingCard";
import { Search, Sort, Tag } from "../components/ui/icons";
import { useTryOn } from "../tryon";
import { STYLE_TAGS } from "../styleTags";
import {
  CATEGORY_LABEL,
  CONDITION_LABEL,
  DELIVERY_LABEL,
  PAYMENT_NOTE,
  SIZES,
  canTryOn,
  listingAsCloth,
  thrift,
  type BrowseFilters,
  type Condition,
  type Delivery,
  type Listing,
} from "../thrift";

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory"];

const SORTS: { value: NonNullable<BrowseFilters["sort"]>; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export default function Thrift() {
  const nav = useNavigate();
  const { toast } = useToast();
  const { tryOn } = useTryOn();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [filters, setFilters] = useState<BrowseFilters>({ sort: "newest" });
  const [sheetOpen, setSheetOpen] = useState(false);

  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const active = useMemo<BrowseFilters>(
    () => ({ ...filters, q: debouncedQ || undefined, category }),
    [filters, debouncedQ, category],
  );

  const load = useCallback(async (f: BrowseFilters) => {
    const id = ++requestId.current;
    setError(null);
    try {
      const r = await thrift.browse(f);
      // A slower earlier request must never overwrite a newer result.
      if (id === requestId.current) setListings(r.listings);
    } catch (err: any) {
      if (id === requestId.current) {
        setError(err?.message ?? "Could not load the marketplace");
        setListings([]);
      }
    }
  }, []);

  useEffect(() => {
    setListings(null);
    load(active);
  }, [active, load]);

  async function toggleSave(l: Listing) {
    const next = !l.saved;
    setListings((prev) => prev?.map((x) => (x.id === l.id ? { ...x, saved: next } : x)) ?? prev);
    try {
      await (next ? thrift.save(l.id) : thrift.unsave(l.id));
    } catch {
      setListings((prev) => prev?.map((x) => (x.id === l.id ? { ...x, saved: !next } : x)) ?? prev);
      toast("Could not update your saved items", { tone: "error" });
    }
  }

  function tryWithWardrobe(l: Listing) {
    if (!canTryOn(l)) {
      toast("This piece is no longer available to try on", { tone: "error" });
      return;
    }
    tryOn(listingAsCloth(l));
  }

  const activeFilterCount =
    (filters.styleTag ? 1 : 0) +
    (filters.condition ? 1 : 0) +
    (filters.size ? 1 : 0) +
    (filters.delivery ? 1 : 0) +
    (filters.city ? 1 : 0) +
    (filters.minPaise !== undefined || filters.maxPaise !== undefined ? 1 : 0) +
    (filters.mine ? 1 : 0);

  return (
    <PageShell>
      <PageTitle
        title="Thrift"
        subtitle="Pre-loved pieces looking for their next outfit."
      />

      <p className="text-[13px] text-ink/60 -mt-2">Give great clothes a second life.</p>

      {/* --------------------------------------------------- browse controls */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-ink/45 pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, brand, category"
              aria-label="Search thrift listings"
              className="pl-10"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => setSheetOpen(true)}
            leading={<Sort className="w-4 h-4" />}
            className="shrink-0"
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
          <FilterChip active={!category} onClick={() => setCategory(undefined)}>
            All
          </FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c]}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- grid */}
      {listings === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={<Tag className="w-7 h-7" />}
          title={error ? "Couldn't load the marketplace" : "No pieces found"}
          body={
            error ??
            "Try changing your filters, or check back soon for new pre-loved finds."
          }
          action={
            error
              ? { label: "Try again", onClick: () => load(active) }
              : activeFilterCount > 0 || category || debouncedQ
                ? {
                    label: "Clear filters",
                    onClick: () => {
                      setFilters({ sort: "newest" });
                      setCategory(undefined);
                      setQ("");
                    },
                  }
                : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              onToggleSave={toggleSave}
              onTryOn={tryWithWardrobe}
            />
          ))}
        </div>
      )}

      <p className="text-[12px] text-ink/60 text-center leading-relaxed">{PAYMENT_NOTE}</p>

      {/* ---------------------------------------------------- filter sheet */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter & sort"
        size="lg"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setFilters({ sort: filters.sort ?? "newest" })}
            >
              Clear
            </Button>
            <Button block className="flex-1" onClick={() => setSheetOpen(false)}>
              Show results
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <Label>Sort by</Label>
            <Select
              value={filters.sort ?? "newest"}
              onChange={(e) =>
                setFilters({ ...filters, sort: e.target.value as BrowseFilters["sort"] })
              }
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>

          <div>
            <Label>Style</Label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_TAGS.filter((t) => t.value !== "other").map((t) => (
                <FilterChip
                  key={t.value}
                  active={filters.styleTag === t.value}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      styleTag: filters.styleTag === t.value ? undefined : t.value,
                    })
                  }
                >
                  {t.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div>
            <Label>Condition</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
                <FilterChip
                  key={c}
                  active={filters.condition === c}
                  onClick={() =>
                    setFilters({ ...filters, condition: filters.condition === c ? undefined : c })
                  }
                >
                  {CONDITION_LABEL[c]}
                </FilterChip>
              ))}
            </div>
          </div>

          <div>
            <Label>Size</Label>
            <div className="flex flex-wrap gap-1.5">
              {SIZES.map((s) => (
                <FilterChip
                  key={s}
                  active={filters.size === s}
                  onClick={() =>
                    setFilters({ ...filters, size: filters.size === s ? undefined : s })
                  }
                >
                  {s}
                </FilterChip>
              ))}
            </div>
          </div>

          <div>
            <Label>Delivery</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(DELIVERY_LABEL) as Delivery[]).map((v) => (
                <FilterChip
                  key={v}
                  active={filters.delivery === v}
                  onClick={() =>
                    setFilters({ ...filters, delivery: filters.delivery === v ? undefined : v })
                  }
                >
                  {DELIVERY_LABEL[v]}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <Label hint="₹">Min price</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={filters.minPaise !== undefined ? filters.minPaise / 100 : ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    minPaise: e.target.value === "" ? undefined : Math.round(Number(e.target.value) * 100),
                  })
                }
                placeholder="0"
              />
            </label>
            <label className="block">
              <Label hint="₹">Max price</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={filters.maxPaise !== undefined ? filters.maxPaise / 100 : ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    maxPaise: e.target.value === "" ? undefined : Math.round(Number(e.target.value) * 100),
                  })
                }
                placeholder="5000"
              />
            </label>
          </div>

          <label className="block">
            <Label hint="Optional">City</Label>
            <Input
              value={filters.city ?? ""}
              onChange={(e) => setFilters({ ...filters, city: e.target.value || undefined })}
              placeholder="e.g. Pune"
              maxLength={60}
            />
          </label>

          <div className="pt-2 border-t border-ink/[0.07]">
            <FilterChip
              active={Boolean(filters.mine)}
              onClick={() => setFilters({ ...filters, mine: filters.mine ? undefined : true })}
            >
              Show my listings
            </FilterChip>
            <p className="text-[12px] text-ink/60 mt-2 leading-snug">
              Your own listings are hidden from browsing by default. Manage them from{" "}
              <button
                type="button"
                className="text-brand-700 font-semibold underline underline-offset-2"
                onClick={() => {
                  setSheetOpen(false);
                  nav("/my-listings");
                }}
              >
                My thrift listings
              </button>
              .
            </p>
          </div>
        </div>
      </Sheet>
    </PageShell>
  );
}
