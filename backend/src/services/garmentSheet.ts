// Builds the single garment image FLUX VTO requires.
//
// The model takes one `garment_image_url`. BFL's guidance for multi-garment
// looks is to "merge them into a single canvas first", so this lays the
// selected pieces out on one white sheet, ordered head-to-toe, and keeps the
// result at roughly one megapixel — the size both fal and BFL recommend, and
// the point below which billing rounds to a single megapixel.
import sharp from "sharp";

/** Long edge of the sheet. 1024x768 = 0.79MP, comfortably under 1MP. */
const SHEET_W = 1024;
const SHEET_H = 768;
const GAP = 12;
const BG = { r: 255, g: 255, b: 255 };

export type SheetItem = {
  imageUrl: string;
  /** Drives layout order only — never sent as text to the model. */
  role: string;
};

/** Head-to-toe, so the sheet reads the way the outfit is worn. */
const ORDER = ["outerwear", "top", "dress", "bottom", "shoes", "accessory", "other"];

function rank(role: string): number {
  const i = ORDER.indexOf(role);
  return i === -1 ? ORDER.length : i;
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch garment image (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Grid that keeps cells as close to square as possible for the item count.
 * One item fills the sheet; two sit side by side; three to five wrap.
 */
function gridFor(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 2 };
}

/**
 * Composites the garments onto one sheet and returns a JPEG buffer.
 *
 * Every input is fitted inside its cell with `fit: "inside"` so nothing is
 * cropped — a garment cut in half would be read by the model as its actual
 * shape. EXIF rotation is applied first, for the same reason.
 */
export async function buildGarmentSheet(items: SheetItem[]): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  count: number;
}> {
  if (items.length === 0) throw new Error("No garments to compose");

  const ordered = [...items].sort((a, b) => rank(a.role) - rank(b.role));

  // A single garment needs no sheet: send it as-is, just normalised to the
  // recommended size. That keeps the common case pixel-for-pixel faithful.
  if (ordered.length === 1) {
    const raw = await fetchImage(ordered[0].imageUrl);
    const buffer = await sharp(raw)
      .rotate()
      .resize(SHEET_W, SHEET_W, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? 0, height: meta.height ?? 0, count: 1 };
  }

  const { cols, rows } = gridFor(ordered.length);
  const cellW = Math.floor((SHEET_W - GAP * (cols + 1)) / cols);
  const cellH = Math.floor((SHEET_H - GAP * (rows + 1)) / rows);

  const tiles = await Promise.all(
    ordered.map(async (item, i) => {
      const raw = await fetchImage(item.imageUrl);
      const fitted = await sharp(raw)
        .rotate()
        .resize(cellW, cellH, { fit: "inside", withoutEnlargement: true })
        .toBuffer();
      const meta = await sharp(fitted).metadata();
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Centre each garment in its cell so the layout stays even when the
      // source aspect ratios differ.
      const left = GAP + col * (cellW + GAP) + Math.floor((cellW - (meta.width ?? 0)) / 2);
      const top = GAP + row * (cellH + GAP) + Math.floor((cellH - (meta.height ?? 0)) / 2);
      return { input: fitted, left: Math.max(0, left), top: Math.max(0, top) };
    }),
  );

  const buffer = await sharp({
    create: { width: SHEET_W, height: SHEET_H, channels: 3, background: BG },
  })
    .composite(tiles)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return { buffer, width: SHEET_W, height: SHEET_H, count: ordered.length };
}

/**
 * Normalises the person image to the size FLUX VTO wants.
 *
 * The output resolution follows the person image, so this is also what makes
 * the result portrait rather than square. Never upscales: a small selfie stays
 * its own size rather than being stretched into softness.
 */
export async function normalisePersonImage(url: string): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const raw = await fetchImage(url);
  const buffer = await sharp(raw)
    .rotate()
    .resize(768, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width ?? 0, height: meta.height ?? 0 };
}
