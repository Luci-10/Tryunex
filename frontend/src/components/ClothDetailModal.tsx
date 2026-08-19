import { useEffect, useState } from "react";
import Sheet from "./ui/Sheet";
import Lightbox from "./Lightbox";
import Button from "./ui/Button";
import { Input, Label, Select, FieldError } from "./ui/Field";
import { Skeleton } from "./ui/Skeleton";
import { useConfirm } from "./ui/Confirm";
import { api, type Cloth, type StyleTag } from "../api";
import { STYLE_TAGS, styleTagOf } from "../styleTags";
import { useChat } from "../chat";
import { useTryOn } from "../tryon";
import { Badge } from "./ui/Chip";
import { Chat, Check, Sparkles, Tag, Trash, Zoom } from "./ui/icons";
import { useNavigate } from "react-router-dom";
import CreateListingSheet from "./thrift/CreateListingSheet";
import { STATUS_LABEL, STATUS_TONE, formatPrice, type ListingStatus } from "../thrift";
import ProtectedPhoto from "./ui/ProtectedPhoto";

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

type ClothListing = { id: string; status: ListingStatus; pricePaise: number };

type Detail = {
  cloth: Cloth;
  wearCount: number;
  lastWornOn: string | null;
  /** Present when this piece is (or was) on the thrift marketplace. */
  listing: ClothListing | null;
};

export default function ClothDetailModal({
  clothId,
  open,
  onClose,
  onSaved,
  onDeleted,
  onWearToday,
}: {
  clothId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: (c: Cloth) => void;
  onDeleted: (id: string) => void;
  onWearToday: (id: string) => Promise<void>;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [styleTag, setStyleTag] = useState<StyleTag>("casual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const nav = useNavigate();
  const { openChat } = useChat();
  const { tryOn } = useTryOn();
  const confirm = useConfirm();

  useEffect(() => {
    if (!open || !clothId) return;
    setData(null);
    setError(null);
    api
      .get<Detail>(`/clothes/${clothId}`)
      .then((d) => {
        setData(d);
        setName(d.cloth.name);
        setCategory(d.cloth.category);
        setStyleTag(d.cloth.styleTag ?? "casual");
      })
      .catch((e) => setError(e.message ?? "Could not load this piece"));
  }, [clothId, open]);

  if (!clothId) return null;
  const dirty = data
    ? name.trim() !== data.cloth.name ||
      category !== data.cloth.category ||
      styleTag !== (data.cloth.styleTag ?? "casual")
    : false;

  async function save() {
    if (!data || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.patch<{ cloth: Cloth }>(`/clothes/${data.cloth.id}`, {
        name: name.trim(),
        category,
        styleTag,
      });
      onSaved(r.cloth);
      setData({ ...data, cloth: r.cloth });
    } catch (err: any) {
      setError(err.message ?? "Could not save your changes");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!data) return;
    const ok = await confirm({
      title: `Delete "${data.cloth.name}"?`,
      body: "This removes the piece and its photo from your wardrobe. It can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.delete(`/clothes/${data.cloth.id}`);
      onDeleted(data.cloth.id);
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function wearToday() {
    if (!data) return;
    setBusy(true);
    try {
      await onWearToday(data.cloth.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Lightbox
        scope="cloth"
        id={zoom && data ? data.cloth.id : undefined}
        alt={data?.cloth.name}
        onClose={() => setZoom(false)}
      />
      <CreateListingSheet
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        cloth={data?.cloth ?? null}
        onSaved={(listing) => {
          if (data) {
            setData({
              ...data,
              listing: { id: listing.id, status: listing.status, pricePaise: listing.pricePaise },
            });
          }
        }}
      />
      <Sheet
        open={open}
        onClose={onClose}
        title={data ? data.cloth.name : "Piece"}
        footer={
          data ? (
            <div className="flex gap-2">
              {data.cloth.status === "clean" && (
                <Button block loading={busy} onClick={wearToday}>
                  Wear today
                </Button>
              )}
              <Button
                block={data.cloth.status !== "clean"}
                variant={dirty ? "primary" : "secondary"}
                disabled={busy || !dirty || !name.trim()}
                onClick={save}
                className={data.cloth.status === "clean" ? "flex-1" : ""}
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {!data ? (
          error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <div className="space-y-4" aria-busy="true">
              <Skeleton className="aspect-square rounded-2xl" />
              <Skeleton className="h-16" />
              <Skeleton className="h-11" />
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <ProtectedPhoto
                scope="cloth"
                id={data.cloth.id}
                alt={data.cloth.name}
                className="w-full aspect-square object-cover rounded-2xl bg-ink/[0.04]"
              />
              <button
                type="button"
                onClick={() => setZoom(true)}
                aria-label={`Zoom into ${data.cloth.name}`}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/95 text-ink text-sm font-medium shadow-card backdrop-blur-sm"
              >
                <Zoom className="w-4 h-4" />
                Zoom
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge tone="lilac">{styleTagOf(data.cloth.styleTag).label}</Badge>
              <Badge tone={data.cloth.status === "clean" ? "mint" : "peach"}>
                {data.cloth.status === "clean" ? "Clean" : "In the wash"}
              </Badge>
              {data.listing && data.listing.status !== "removed" && (
                <Badge tone={STATUS_TONE[data.listing.status]}>
                  {data.listing.status === "sold"
                    ? "Sold"
                    : `Listed for sale · ${formatPrice(data.listing.pricePaise)}`}
                </Badge>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-2 text-center">
              <Fact label="Category" value={data.cloth.category} capitalize />
              <Fact
                label="Times worn"
                value={String(data.wearCount)}
              />
              <Fact
                label="Last worn"
                value={
                  data.lastWornOn
                    ? new Date(data.lastWornOn + "T00:00:00").toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "Never"
                }
              />
            </dl>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="quiet"
                leading={<Sparkles className="w-4 h-4" />}
                onClick={() => {
                  tryOn(data.cloth);
                  onClose();
                }}
              >
                Try on
              </Button>
              <Button
                variant="quiet"
                leading={<Chat className="w-4 h-4" />}
                onClick={() => {
                  openChat(data.cloth);
                  onClose();
                }}
              >
                Ask AI
              </Button>
            </div>

            {/* Listing the piece never removes it from the wardrobe — it stays
                here, marked, so it can still be worn, planned and tried on. */}
            {data.listing && data.listing.status !== "removed" ? (
              <Button
                block
                variant="quiet"
                leading={<Tag className="w-4 h-4" />}
                onClick={() => {
                  onClose();
                  nav("/my-listings");
                }}
              >
                {data.listing.status === "sold" ? "View sold listing" : "Manage listing"}
              </Button>
            ) : (
              <Button
                block
                variant="quiet"
                leading={<Tag className="w-4 h-4" />}
                onClick={() => setSellOpen(true)}
              >
                Sell this piece
              </Button>
            )}

            <label className="block">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </label>

            <label className="block">
              <Label>Category</Label>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="capitalize"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>

            <div>
              <Label hint="Used by the assistant">Style</Label>
              <div role="radiogroup" aria-label="Style" className="flex flex-wrap gap-1.5">
                {STYLE_TAGS.map((t) => {
                  const active = styleTag === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStyleTag(t.value)}
                      className={`inline-flex items-center gap-1 h-9 px-3 rounded-full text-[13px] border transition-colors ${
                        active
                          ? "bg-brand-500 text-white border-brand-500 font-medium"
                          : "bg-white text-ink/70 border-ink/12 hover:bg-brand-50 hover:text-brand-700"
                      }`}
                    >
                      {active && <Check className="w-3.5 h-3.5" />}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <FieldError>{error}</FieldError>

            <div className="pt-2 border-t border-ink/[0.07]">
              <Button
                variant="destructive"
                block
                disabled={busy}
                onClick={del}
                leading={<Trash className="w-4 h-4" />}
              >
                Delete this piece
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Fact({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-xl bg-ink/[0.04] px-2 py-2.5">
      <dt className="text-[11px] text-ink/65 uppercase tracking-wide">{label}</dt>
      <dd className={`text-sm font-semibold mt-0.5 truncate ${capitalize ? "capitalize" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
