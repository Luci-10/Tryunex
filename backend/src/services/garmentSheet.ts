// Builds the single garment image FLUX VTO requires.
//
// The model takes one `garment_image_url`. fal's schema is explicit:
// "Multiple garments must be merged into a single composite image before
// submission." So this lays the selected pieces out on one white sheet,
// ordered head-to-toe, sized to fal's ~0.5MP recommendation for the garment
// input (hard cap 1MP). Staying under a megapixel also keeps billing, which
// rounds each image up to the next megapixel, at one unit.
import sharp from "sharp";
import { keyFromUrl, presignGet } from "./r2.js";

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

/**
 * Reads an image we hold.
 *
 * Anything that resolves to one of our own R2 objects is fetched through a
 * short-lived signed URL rather than its public address, so this keeps working
 * once the bucket is closed to the world. Both buildGarmentSheet and
 * normalisePersonImage go through here, which is why this is the only place
 * that needs to know.
 */
async function fetchImage(url: string): Promise<Buffer> {
  let target = url;
  try {
    // Only sign things that actually live in our bucket. keyFromUrl treats any
    // non-http string as a bare key, so a data: URI would otherwise be signed
    // as if it were an R2 object and fetched from the wrong host entirely.
    if (/^https?:\/\//i.test(url)) {
      const key = keyFromUrl(url);
      if (key) target = presignGet(key);
    }
  } catch {
    // R2 not configured, or not one of ours (a data: URI in tests). Use as-is.
  }
  const res = await fetch(target);
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

/**
 * Stand-in result for preview mode — see `tryonMockEnabled()`.
 *
 * Deliberately, visibly marked. A mock that looked like a real result would be
 * the single most dangerous thing in this codebase: it would misrepresent a
 * paid feature to whoever saw it. It composites the garment sheet onto the
 * person image and stamps a banner across the top, so it is useful for
 * checking layout, credits, caching, download and share — and impossible to
 * mistake for a generation.
 */
export async function buildMockResult(
  personBuffer: Buffer,
  garmentBuffer: Buffer,
): Promise<Buffer> {
  const base = sharp(personBuffer);
  const meta = await base.metadata();
  const w = meta.width ?? 768;
  const h = meta.height ?? 1024;

  const thumbW = Math.round(w * 0.34);
  const thumb = await sharp(garmentBuffer)
    .resize(thumbW, thumbW, { fit: "inside" })
    .toBuffer();
  const thumbMeta = await sharp(thumb).metadata();

  const banner = Buffer.from(
    `<svg width="${w}" height="${h}">
       <rect x="0" y="0" width="${w}" height="${Math.round(h * 0.085)}" fill="#20212A" opacity="0.88"/>
       <text x="${w / 2}" y="${Math.round(h * 0.055)}" font-family="Helvetica,Arial,sans-serif"
             font-size="${Math.round(w * 0.045)}" font-weight="bold" fill="#ffffff"
             text-anchor="middle">PREVIEW MODE — NOT A REAL TRY-ON</text>
     </svg>`,
  );

  return sharp(personBuffer)
    .composite([
      { input: thumb, left: w - (thumbMeta.width ?? thumbW) - 16, top: h - (thumbMeta.height ?? thumbW) - 16 },
      { input: banner, left: 0, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
