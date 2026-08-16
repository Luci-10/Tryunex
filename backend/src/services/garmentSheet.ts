// Builds the single garment image FLUX VTO requires.
//
// The model takes one `garment_image_url`. fal's schema is explicit:
// "Multiple garments must be merged into a single composite image before
// submission." So this lays the selected pieces out on one white sheet,
// ordered head-to-toe, sized to fal's ~0.5MP recommendation for the garment
// input (hard cap 1MP). Staying under a megapixel also keeps billing, which
// rounds each image up to the next megapixel, at one unit.
import sharp from "sharp";

// fal's schema: garment images are "Maximum 1 megapixel; recommended around
// 0.5 MP". 832x624 = 0.52MP, which sits on that recommendation with headroom
// under the hard cap.
const SHEET_W = 832;
const SHEET_H = 624;
/** Ceiling applied to every garment image, sheet or single. */
const GARMENT_MAX_PIXELS = 540_000;
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

/**
 * Scales a size down so it fits a pixel budget, preserving aspect ratio.
 * Returns null when it already fits — nothing is ever upscaled.
 */
function fitPixelBudget(
  width: number,
  height: number,
  maxPixels: number,
): { w: number; h: number } | null {
  const pixels = width * height;
  if (pixels <= maxPixels || pixels === 0) return null;
  const scale = Math.sqrt(maxPixels / pixels);
  return { w: Math.max(1, Math.floor(width * scale)), h: Math.max(1, Math.floor(height * scale)) };
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
    const upright = await sharp(raw).rotate().toBuffer();
    const m = await sharp(upright).metadata();
    // Budget by pixel count, not by long edge: a square garment constrained
    // only by a 1024 long edge would be 1.05MP, over fal's hard maximum.
    const fit = fitPixelBudget(m.width ?? 0, m.height ?? 0, GARMENT_MAX_PIXELS);
    const buffer = await sharp(upright)
      .resize(fit ? { width: fit.w, height: fit.h, fit: "inside" } : {})
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
