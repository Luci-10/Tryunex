# Marketing photography

Public-facing photography for the login page and the onboarding walkthrough.
These are the only images shown to signed-out visitors and first-run users.

**Nothing in this folder may come from a customer.** No wardrobe uploads, no
try-on results, no `/uploads` content, no screenshots containing a real
person's gallery or notifications. This folder is project-owned assets only.

The slot definitions live in `frontend/src/marketing/assets.ts` — filenames,
ratios and alt text are read from there, so add files to match that manifest
rather than editing paths in components.

## Until the files land

`<Photo>` falls back to the existing token-drawn illustration whenever a file
is missing or fails to decode. The pages render correctly with this folder
empty; they simply are not photographic yet. Dropping a file in switches that
slot over with no code change.

## Sourcing rules

Pick exactly one of these per image, and record which:

1. **Commissioned or project-owned** — you hold the shoot files and a model
   release covering commercial use.
2. **Licensed stock** — the licence must permit commercial use. Check whether
   attribution is required and, if it is, add it to `ATTRIBUTION.md` here.
   Note that most stock licences do **not** permit depicting the subject as
   endorsing a product, which is exactly what the try-on pair does — read the
   model-release terms before using stock for `tryon-*`.
3. **AI-generated** — generic marketing visuals only. Must not resemble a real,
   identifiable person. Reject any frame with distorted hands, garment edges
   that dissolve, unreadable text on a phone screen, or uncanny faces.

Never use a celebrity, influencer, public figure or customer likeness.

## Encoding

Produce AVIF **and** WebP for every width. `<Photo>` offers AVIF first and
falls back to WebP.

```sh
# from this folder, for each source file
for w in 800 1200 1600; do
  cwebp -q 82 -resize $w 0 login-hero.jpg -o login-hero-$w.webp
  avifenc --min 24 --max 32 -s 6 login-hero.jpg login-hero-$w.avif
done
```

Budgets, so the login stays fast on mobile: hero ≤ 120 KB at 1600w, everything
else ≤ 60 KB at its largest width.

## Shot list

Common direction for all frames: natural daylight, real people and real
clothing, editorial but approachable — everyday Indian and global fashion, not
luxury-only styling. Inclusive, non-stereotyped casting. Nothing
over-sexualised. Soft lavender, peach, mint and warm neutral tones to match the
brand palette. Clean, uncluttered bedrooms, dressing areas, closets or neutral
studio.

| File base | Widths | Ratio | Direction |
| --- | --- | --- | --- |
| `login-hero` | 800/1200/1600 | 3:4 | Person standing at an open wardrobe, holding a phone or reaching for a garment. **Leave negative space in the lower third** — copy and a gradient sit there. Must crop well from 3:4 down to a tall desktop panel. |
| `login-wardrobe` | 800 | 4:3 | Clothes neatly arranged on a rail in a bright bedroom. No person required. |
| `login-plan` | 800 | 4:3 | An outfit laid out beside a phone and a paper calendar. Simple, uncluttered. |
| `login-share` | 800 | 4:3 | Two friends looking at one phone together while choosing an outfit. |
| `tryon-before` | 600/900 | 3:4 | Demo model, plain everyday outfit, neutral background. |
| `tryon-after` | 600/900 | 3:4 | **Same model, same pose, same framing, same crop**, styled in a different outfit. The wipe only reads correctly if the body position matches. |
| `slide-welcome` | 800 | 16:9 | Person looking through clothes on a rail in a bright personal space. |
| `slide-add` | 800 | 16:9 | Close-up of someone photographing a garment with their phone. The phone screen must not show a readable gallery or personal notifications. |
| `slide-look` | 800 | 16:9 | Flat-lay of a full outfit — top, bottom, shoes, one accessory — on a clean background. |
| `slide-plan` | 800 | 16:9 | An outfit set out for tomorrow beside a calendar or phone. Visually simple. |
| `slide-chat` | 800 | 16:9 | Person holding a phone while deciding between two outfits on a rail. Not a fake chat screenshot. |
| `slide-ready` | 800 | 16:9 | Positive, calm lifestyle frame — someone in a styled everyday outfit. |

## The try-on pair specifically

`tryon-before` / `tryon-after` are the only images that make a claim about the
product. They are labelled "Before" and "Try-on preview" in the UI and carry
the visible disclaimer *"Demo preview. AI results, fit, and sizing may vary."*

Both frames must be the same person under a release that covers this use. Do
not composite a stock model into a garment they did not wear unless the licence
explicitly allows derivative depiction — that is the failure mode that turns a
demo into a misrepresentation.
