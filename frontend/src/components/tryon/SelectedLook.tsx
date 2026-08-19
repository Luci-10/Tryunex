import type { Cloth } from "../../api";
import { useTryOn, slotOf, roleOf, SLOT_LABEL, MAX_OUTFIT_ITEMS } from "../../tryon";
import { styleTagOf } from "../../styleTags";
import IconButton from "../ui/IconButton";
import Button from "../ui/Button";
import { Badge } from "../ui/Chip";
import EmptyState from "../ui/EmptyState";
import { Close, Shirt } from "../ui/icons";
import ProtectedPhoto from "../ui/ProtectedPhoto";

/** The session basket: everything chosen for try-on, from anywhere in the app. */
export default function SelectedLook({
  onPickClothes,
  onChangeRole,
  compact = false,
}: {
  onPickClothes: () => void;
  /** Re-opens the role sheet for an `other` garment. */
  onChangeRole?: (cloth: Cloth) => void;
  /** Thumbnails only — used beneath a generated result. */
  compact?: boolean;
}) {
  const { selection, remove, clear, locked, roles } = useTryOn();

  if (selection.length === 0) {
    return (
      <EmptyState
        icon={<Shirt className="w-7 h-7" />}
        title="Nothing picked yet"
        body={`Choose up to ${MAX_OUTFIT_ITEMS} pieces and see them on your photo.`}
        action={{ label: "Pick clothes", onClick: onPickClothes }}
      />
    );
  }

  if (compact) {
    return (
      <ul className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
        {selection.map((c) => (
          <li key={c.id} className="shrink-0 w-16">
            <ProtectedPhoto
              scope="cloth"
              id={c.id}
              alt={c.name}
              className="w-16 h-16 rounded-xl object-cover bg-ink/[0.05]"
            />
            <p className="text-[10px] text-ink/65 truncate mt-1">{c.name}</p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">
          Selected look
          <span className="ml-1.5 text-ink/45 font-normal">
            {selection.length} item{selection.length === 1 ? "" : "s"}
          </span>
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={locked}
          className="tap-44 text-[12.5px] text-ink/60 hover:text-ink underline underline-offset-2 disabled:opacity-40"
        >
          Clear outfit
        </button>
      </div>

      <ul className="space-y-2">
        {selection.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-xl border border-ink/[0.07] bg-white p-2">
            <ProtectedPhoto
              scope="cloth"
              id={c.id}
              alt={c.name}
              className="w-12 h-12 rounded-lg object-cover bg-ink/[0.05] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium truncate">{c.name}</p>
              <span className="flex flex-wrap items-center gap-1 mt-0.5">
                <Badge tone="ink">{SLOT_LABEL[slotOf(c)]}</Badge>
                {/* A garment filed under Other keeps its wardrobe label and
                    shows the role it is playing in this particular look. */}
                {slotOf(c) === "other" && roleOf(c, roles) && (
                  <Badge tone="sky">Try-on role: {SLOT_LABEL[roleOf(c, roles)!]}</Badge>
                )}
                <Badge tone="lilac">{styleTagOf(c.styleTag).label}</Badge>
                {c.status === "worn" && <Badge tone="peach">Worn</Badge>}
              </span>
              {slotOf(c) === "other" && onChangeRole && (
                <button
                  type="button"
                  onClick={() => onChangeRole(c)}
                  disabled={locked}
                  className="tap-44 text-[11.5px] text-brand-700 hover:underline mt-1 disabled:opacity-40"
                >
                  Change role
                </button>
              )}
            </div>
            <IconButton
              label={`Remove ${c.name} from your look`}
              tone="danger"
              disabled={locked}
              onClick={() => remove(c.id)}
            >
              <Close className="w-4 h-4" />
            </IconButton>
          </li>
        ))}
      </ul>

      {selection.length < MAX_OUTFIT_ITEMS && (
        <Button variant="secondary" size="sm" block onClick={onPickClothes} disabled={locked}>
          Add another piece
        </Button>
      )}
    </div>
  );
}

/** Human-readable slot summary, e.g. "Top · Bottom · Shoes". */
export function slotSummary(selection: Cloth[]) {
  return selection.map((c) => SLOT_LABEL[slotOf(c)]).join(" · ");
}
