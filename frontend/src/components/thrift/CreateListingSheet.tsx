import { useEffect, useState } from "react";
import Sheet from "../ui/Sheet";
import Button from "../ui/Button";
import { Input, Label, Select, Textarea, FieldError } from "../ui/Field";
import { useToast } from "../ui/Toast";
import type { Cloth } from "../../api";
import {
  CONDITION_LABEL,
  DELIVERY_LABEL,
  PAYMENT_NOTE,
  SIZES,
  thrift,
  type Condition,
  type Delivery,
  type Listing,
} from "../../thrift";

type Draft = {
  title: string;
  price: string;
  size: string;
  condition: Condition;
  brand: string;
  description: string;
  deliveryPreference: Delivery;
  city: string;
};

/**
 * Create or edit a listing for a wardrobe piece the seller already owns.
 *
 * The garment photo, category and style tag are not editable here — they come
 * from the wardrobe item and the server reads them from the cloth row, so a
 * listing can never point at an image the seller didn't upload.
 */
export default function CreateListingSheet({
  open,
  onClose,
  cloth,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The wardrobe piece being listed. Required when creating. */
  cloth?: Cloth | null;
  /** Present when editing an existing listing. */
  existing?: Listing | null;
  onSaved: (listing: Listing) => void;
}) {
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function blank(): Draft {
    return {
      title: "",
      price: "",
      size: "",
      condition: "gently_used",
      brand: "",
      description: "",
      deliveryPreference: "either",
      city: "",
    };
  }

  // Re-seed every time the sheet opens so a previous draft never bleeds into
  // the next piece.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setD({
        title: existing.title,
        price: String(existing.pricePaise / 100),
        size: existing.size,
        condition: existing.condition,
        brand: existing.brand ?? "",
        description: existing.description ?? "",
        deliveryPreference: existing.deliveryPreference,
        city: existing.city ?? "",
      });
    } else {
      setD({ ...blank(), title: cloth?.name ?? "" });
    }
    setError(null);
  }, [open, existing, cloth]);

  const image = existing?.imageUrl ?? cloth?.imageUrl ?? null;
  const priceNumber = Number(d.price);
  const validPrice = d.price.trim() !== "" && Number.isFinite(priceNumber) && priceNumber >= 1;
  const ready = d.title.trim() !== "" && validPrice && d.size.trim() !== "";

  async function submit(status: "draft" | "active") {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const payload = {
      title: d.title.trim(),
      pricePaise: Math.round(priceNumber * 100),
      size: d.size.trim(),
      condition: d.condition,
      brand: d.brand.trim() || null,
      description: d.description.trim() || null,
      deliveryPreference: d.deliveryPreference,
      city: d.city.trim() || null,
    };
    try {
      if (existing) {
        const r = await thrift.update(existing.id, { ...payload, status });
        onSaved(r.listing);
        toast("Listing updated", { tone: "success" });
      } else {
        if (!cloth) throw new Error("No piece selected");
        const r = await thrift.create({ ...payload, clothId: cloth.id, status });
        onSaved(r.listing);
        toast(status === "active" ? "Your piece is listed" : "Draft saved", { tone: "success" });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Could not save the listing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? "Edit listing" : "Create thrift listing"}
      description="Buyers see this on the Thrift marketplace."
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={busy || !ready}
            onClick={() => submit("draft")}
            className="flex-1"
          >
            Save draft
          </Button>
          <Button block loading={busy} disabled={!ready} onClick={() => submit("active")} className="flex-1">
            {existing ? "Save changes" : "List it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {image && (
          <div className="flex gap-3 items-center">
            <img
              src={image}
              alt=""
              className="w-20 h-20 rounded-xl object-cover bg-ink/[0.04] shrink-0"
            />
            <p className="text-[13px] text-ink/65 leading-snug">
              This uses the photo already in your wardrobe. The piece stays in your wardrobe,
              marked <strong className="text-ink font-semibold">Listed for sale</strong>.
            </p>
          </div>
        )}

        <label className="block">
          <Label>Title</Label>
          <Input
            value={d.title}
            onChange={(e) => setD({ ...d, title: e.target.value })}
            maxLength={80}
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label hint="INR">Price</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              step={1}
              value={d.price}
              onChange={(e) => setD({ ...d, price: e.target.value })}
              placeholder="499"
              required
            />
          </label>
          <label className="block">
            <Label>Size</Label>
            <Input
              value={d.size}
              onChange={(e) => setD({ ...d, size: e.target.value })}
              list="thrift-sizes"
              placeholder="M or 32"
              maxLength={24}
              required
            />
            <datalist id="thrift-sizes">
              {SIZES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Condition</Label>
            <Select
              value={d.condition}
              onChange={(e) => setD({ ...d, condition: e.target.value as Condition })}
            >
              {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <Label>Delivery</Label>
            <Select
              value={d.deliveryPreference}
              onChange={(e) => setD({ ...d, deliveryPreference: e.target.value as Delivery })}
            >
              {(Object.keys(DELIVERY_LABEL) as Delivery[]).map((v) => (
                <option key={v} value={v}>
                  {DELIVERY_LABEL[v]}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <label className="block">
          <Label hint="Optional">Brand</Label>
          <Input
            value={d.brand}
            onChange={(e) => setD({ ...d, brand: e.target.value })}
            maxLength={40}
            placeholder="e.g. Levi's"
          />
        </label>

        <label className="block">
          <Label hint="Optional">Description</Label>
          <Textarea
            rows={3}
            value={d.description}
            onChange={(e) => setD({ ...d, description: e.target.value })}
            maxLength={1000}
            placeholder="Fit, fabric, any flaws worth mentioning."
          />
          <span className="block text-[11px] text-ink/50 mt-1">{d.description.length}/1000</span>
        </label>

        <label className="block">
          <Label hint="City only — optional">Your city</Label>
          <Input
            value={d.city}
            onChange={(e) => setD({ ...d, city: e.target.value })}
            maxLength={60}
            placeholder="e.g. Pune"
          />
          <span className="block text-[11px] text-ink/55 mt-1">
            Shown on your listing to help with local pickup. Never share your exact address.
          </span>
        </label>

        <FieldError>{error}</FieldError>

        <p className="text-[12px] text-ink/60 leading-relaxed rounded-xl bg-ink/[0.035] px-3 py-2.5">
          {PAYMENT_NOTE} TryUnex does not handle marketplace payments, shipping or returns.
        </p>
      </div>
    </Sheet>
  );
}
