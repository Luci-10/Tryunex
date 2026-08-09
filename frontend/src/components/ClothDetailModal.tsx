import { useEffect, useState } from "react";
import Sheet from "./ui/Sheet";
import Lightbox from "./Lightbox";
import Button from "./ui/Button";
import { Input, Label, Select, FieldError } from "./ui/Field";
import { Skeleton } from "./ui/Skeleton";
import { useConfirm } from "./ui/Confirm";
import { api, type Cloth } from "../api";
import { useChat } from "../chat";
import { useTryOn } from "../tryon";
import { Chat, Sparkles, Trash, Zoom } from "./ui/icons";

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "other"];

type Detail = { cloth: Cloth; wearCount: number; lastWornOn: string | null };

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
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
      })
      .catch((e) => setError(e.message ?? "Could not load this piece"));
  }, [clothId, open]);

  if (!clothId) return null;
  const dirty = data ? name.trim() !== data.cloth.name || category !== data.cloth.category : false;

  async function save() {
    if (!data || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.patch<{ cloth: Cloth }>(`/clothes/${data.cloth.id}`, {
        name: name.trim(),
        category,
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
        src={zoom && data ? data.cloth.imageUrl : null}
        alt={data?.cloth.name}
        onClose={() => setZoom(false)}
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
              <img
                src={data.cloth.imageUrl}
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
