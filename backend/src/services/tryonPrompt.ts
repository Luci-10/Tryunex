// Pure prompt construction for virtual try-on. No I/O, no config — kept
// separate from the route so it can be exercised on its own.
// The generated image is an edit of the user's own photo, not a new person.
// Everything below is written to keep the model from "re-imagining" them —
// identity drift and leftover fragments of the original clothing are the two
// failure modes worth spending prompt tokens on.
const IDENTITY_RULES = `This is a photo edit, not a new photograph. The FIRST image is the person. Treat it as the source of truth for everything except the clothing being replaced.

Preserve exactly, without alteration:
- The face and all facial features, expression, and apparent age.
- Skin tone and complexion.
- Hair style, length, and colour.
- Body proportions, body shape, and size.
- Pose, posture, hand and arm position.
- Camera angle, framing, crop, and distance.
- Lighting direction, colour temperature, and shadows.
- The background, in full.

Never do any of the following:
- Slim, reshape, retouch, or otherwise "improve" the person.
- Change their age, expression, or pose.
- Add accessories, jewellery, watches, bags, hats, makeup, or tattoos that were not asked for.
- Add text, logos, watermarks, borders, collages, split panels, or extra people.
- Produce more than one image or view.`;

const REPLACEMENT_RULES = `Replacing the clothing:
- Change ONLY the body regions covered by the garments listed below.
- Fully remove and cover the original clothing in those regions. No fragments of the previous garment may remain — no old collar, neckline, sleeve ends, cuffs, hem, waistband, straps, buttons, logos, or pattern showing through or peeking out at the edges.
- Where the new garment is shorter or more open than the original, render the body or the underlying layer as it would naturally appear, not a remnant of the old clothing.
- Match each garment's colour, pattern, texture, and silhouette to its reference image faithfully.
- Leave every body region NOT covered by a listed garment exactly as it is in the first image — including footwear, if no footwear was selected.
- Render the result as one clean, realistic, full-frame fashion photograph.`;

const CATEGORY_ORDER = ["dress", "top", "outerwear", "bottom", "shoes", "accessory", "other"];

/**
 * Builds the instruction from the actual garments in the request. Naming each
 * reference image and its slot stops the model mixing up which picture goes
 * where, which is the main cause of garments landing on the wrong body part.
 */
const FRESH_GENERATION = `Generate a new independent virtual try-on result from the original selfie and selected garment images. Do not use, reference, reproduce, or derive from any prior generated result. This is a first-time generation from the source images alone.`;

export function buildPrompt(
  items: { name: string; category: string; role?: string }[],
  opts: { fresh?: boolean } = {},
): string {
  // The role, where the user gave one, is what the model should place by.
  items = items.map((c) => ({ ...c, category: c.role ?? c.category }));
  const manifest = items
    .map((c, i) => `- IMAGE ${i + 2}: ${c.category} — "${c.name}"`)
    .join("\n");

  const cats = items.map((c) => c.category);
  const has = (c: string) => cats.includes(c);
  const countOf = (c: string) => cats.filter((x) => x === c).length;

  const notes: string[] = [];
  if (has("dress")) {
    notes.push(
      "The dress is a single full-body garment: it replaces both the upper and lower body clothing. Do not render a separate top or trousers underneath it.",
    );
  }
  if (countOf("top") > 1 || (has("top") && has("outerwear"))) {
    notes.push(
      "The tops are layered. Render the lighter/inner garment against the body and the heavier/outer one open or worn over it, so both stay visible and read as one deliberate outfit.",
    );
  }
  if (has("shoes")) {
    notes.push("Place the footwear on the feet, in correct perspective with the existing stance.");
  }
  if (has("accessory")) {
    notes.push(
      "Place each accessory where it is normally worn, at a natural scale. Do not invent any accessory that is not pictured.",
    );
  }
  if (!has("shoes")) {
    notes.push("No footwear was selected — keep the original shoes and feet untouched.");
  }

  const sorted = [...items].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
  const summary =
    sorted.length === 1
      ? `the single garment shown in IMAGE 2`
      : `all ${sorted.length} garments together as one complete outfit`;

  return [
    opts.fresh ? FRESH_GENERATION : "",
    opts.fresh ? "" : null,
    `Edit the FIRST image so the person is wearing ${summary}.`,
    "",
    "Garment reference images:",
    manifest,
    "",
    IDENTITY_RULES,
    "",
    REPLACEMENT_RULES,
    notes.length ? "\nFor this particular outfit:\n" + notes.map((n) => `- ${n}`).join("\n") : "",
  ]
    .filter((line) => line !== null && line !== "")
    .join("\n");
}
