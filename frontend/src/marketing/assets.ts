/**
 * Single source of truth for the public marketing photography used on the
 * login page and the onboarding walkthrough.
 *
 * These are the only images shown to signed-out visitors and first-run users,
 * so nothing here may ever point at a customer's wardrobe photo, a try-on
 * result, or anything under /uploads. Every slot resolves to a project-owned
 * file served from /images/marketing/.
 *
 * Files are not committed yet — see public/images/marketing/README.md for the
 * shot list and licensing rules. Until a file exists, <Photo> falls back to
 * the token-drawn illustration passed alongside it, so the pages stay intact.
 */

export type Slot = {
  /** Base path without extension, relative to the site root. */
  base: string;
  /** Intrinsic ratio of the container, e.g. 4 / 5. Prevents layout shift. */
  aspect: number;
  /** Widths to emit in srcset. One entry means no srcset. */
  widths: number[];
  /** `sizes` attribute — how wide the image renders at each breakpoint. */
  sizes: string;
  /**
   * object-position. Faces and garments sit above centre in most portrait
   * fashion crops, so the default pulls the crop upward.
   */
  position: string;
  /**
   * Alt text. Empty string marks the image decorative — only correct where
   * adjacent copy already carries the same meaning.
   */
  alt: string;
};

const HERO_WIDTHS = [800, 1200, 1600];
const PAIR_WIDTHS = [600, 900];
const CARD_WIDTHS = [800];

export const SLOTS = {
  /* ---------------------------------------------------------- landing */

  /**
   * The landing hero. Above the fold, so it is the one eagerly-loaded asset
   * on the page. Must contain no text, logo, UI mockup, watermark or brand
   * mark — the page supplies all of those itself, and baked-in text cannot be
   * translated, restyled or read by a screen reader.
   */
  /**
   * Hero: the virtual-fitting illustration.
   *
   * Export CROPPED so the "Virtual Clothes Fitting" title is not included.
   * Baked-in text cannot be translated, restyled or read by a screen reader,
   * and it would duplicate the page's own headline. The crop is why the ratio
   * here is 5:4 rather than the source's near-square.
   */
  "landing-fitting": {
    base: "/images/marketing/landing-fitting",
    aspect: 5 / 4,
    widths: [640, 960, 1280],
    sizes: "(min-width: 1024px) 46vw, 92vw",
    position: "50% 50%",
    alt: "An illustration of someone choosing a garment on screen while a styled outfit is previewed beside it.",
  },

  /** "How it works": the digital-wardrobe illustration. Below the fold, lazy. */
  "landing-wardrobe": {
    base: "/images/marketing/landing-wardrobe",
    aspect: 3 / 2,
    widths: [640, 960, 1280],
    sizes: "(min-width: 1024px) 46vw, 92vw",
    position: "50% 50%",
    alt: "An illustration of a laptop showing a row of dresses, with a person browsing them.",
  },

  /* ------------------------------------------------------------ login */

  /** Above the fold on desktop. The only eagerly-loaded marketing image. */
  "login-hero": {
    base: "/images/marketing/login-hero",
    aspect: 3 / 4,
    widths: HERO_WIDTHS,
    sizes: "(min-width: 1024px) 50vw, 100vw",
    position: "50% 30%",
    alt: "A person choosing clothes from an open wardrobe in bright daylight.",
  },

  /** Login showcase scene 1 — wardrobe. */
  "login-wardrobe": {
    base: "/images/marketing/login-wardrobe",
    aspect: 4 / 3,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 1024px) 30vw, 90vw",
    position: "50% 45%",
    alt: "Neatly arranged clothes on a rail in a bright bedroom.",
  },

  /** Login showcase scene 2 — planning. */
  "login-plan": {
    base: "/images/marketing/login-plan",
    aspect: 4 / 3,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 1024px) 30vw, 90vw",
    position: "50% 50%",
    alt: "An outfit laid out beside a phone and a weekly calendar.",
  },

  /** Login showcase scene 4 — sharing. */
  "login-share": {
    base: "/images/marketing/login-share",
    aspect: 4 / 3,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 1024px) 30vw, 90vw",
    position: "50% 40%",
    alt: "Two friends looking at a phone together while choosing an outfit.",
  },

  /* -------------------------------------------------- try-on demo pair */

  /**
   * The demo pair. Both frames MUST be the same model, same pose, same
   * framing, shot or generated under a release that permits commercial use.
   * Labelled "Before" / "Try-on preview" and carries a visible disclaimer
   * everywhere it appears — this is never presented as a customer result.
   */
  "tryon-before": {
    base: "/images/marketing/tryon-before",
    aspect: 3 / 4,
    widths: PAIR_WIDTHS,
    sizes: "(min-width: 1024px) 28vw, 88vw",
    position: "50% 25%",
    alt: "Demo model photographed in a plain everyday outfit before the try-on preview.",
  },
  "tryon-after": {
    base: "/images/marketing/tryon-after",
    aspect: 3 / 4,
    widths: PAIR_WIDTHS,
    sizes: "(min-width: 1024px) 28vw, 88vw",
    position: "50% 25%",
    alt: "The same demo model shown in a styled outfit as a try-on preview.",
  },

  /* ------------------------------------------------------ walkthrough */

  "slide-welcome": {
    base: "/images/marketing/slide-welcome",
    aspect: 16 / 9,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 640px) 28rem, 92vw",
    position: "50% 35%",
    alt: "A person looking through clothes on a rail in a bright room.",
  },
  "slide-add": {
    base: "/images/marketing/slide-add",
    aspect: 16 / 9,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 640px) 28rem, 92vw",
    position: "50% 45%",
    alt: "Close-up of someone photographing a folded shirt with their phone.",
  },
  "slide-look": {
    base: "/images/marketing/slide-look",
    aspect: 16 / 9,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 640px) 28rem, 92vw",
    position: "50% 50%",
    alt: "A flat-lay of a complete outfit: top, trousers, shoes and a bag.",
  },
  "slide-plan": {
    base: "/images/marketing/slide-plan",
    aspect: 16 / 9,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 640px) 28rem, 92vw",
    position: "50% 50%",
    alt: "An outfit set out for the next day beside a calendar.",
  },
  "slide-chat": {
    base: "/images/marketing/slide-chat",
    aspect: 16 / 9,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 640px) 28rem, 92vw",
    position: "50% 40%",
    alt: "A person holding a phone while deciding between two outfits on a rail.",
  },
  "slide-ready": {
    base: "/images/marketing/slide-ready",
    aspect: 16 / 9,
    widths: CARD_WIDTHS,
    sizes: "(min-width: 640px) 28rem, 92vw",
    position: "50% 35%",
    alt: "A person smiling in a styled everyday outfit in natural daylight.",
  },
} satisfies Record<string, Slot>;

export type SlotName = keyof typeof SLOTS;

/** Disclaimer shown wherever the demo pair appears. Wording is deliberate. */
export const DEMO_DISCLAIMER = "Demo preview. AI results, fit, and sizing may vary.";

/**
 * WebP only, deliberately.
 *
 * An earlier version offered AVIF via a <picture><source> pair. That is a trap:
 * when a <source> matches on type but its file 404s, the browser does not fall
 * back to the next source — the image just fails. Anyone who exported WebP but
 * not AVIF would silently get illustrations everywhere. One format means one
 * failure mode, and WebP is ~97% supported.
 */
export function srcSetFor(slot: Slot): string {
  return slot.widths.map((w) => `${slot.base}-${w}.webp ${w}w`).join(", ");
}

/** The single `src`, used by browsers that ignore srcset. */
export function srcFor(slot: Slot): string {
  const w = slot.widths[slot.widths.length - 1];
  return `${slot.base}-${w}.webp`;
}
