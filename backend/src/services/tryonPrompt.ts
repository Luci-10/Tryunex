// Prompt for FLUX Virtual Try-On (`fal-ai/flux-pro/v1/vto`).
//
// This model takes a person image and one garment image and is already trained
// to swap clothing while holding identity. The prompt's job is therefore to be
// specific about what must NOT change, and about which pieces on the garment
// sheet are being worn — not to describe the scene from scratch.

export type PromptItem = {
  name: string;
  /** Wardrobe category. */
  category: string;
  /** Try-on role for `other` garments, chosen by the user for this look. */
  role?: string;
};

const IDENTITY_RULES = [
  "Keep the same person: identical face, facial features, expression, hairstyle and hair colour, skin tone, and body shape and proportions.",
  "Keep the original pose, camera angle, framing, lighting, shadows and background exactly as they are.",
  "Do not slim, enlarge, retouch or otherwise reshape the body.",
].join(" ");

const GARMENT_RULES = [
  "Replace only the clothing listed below.",
  "Remove any existing garment that occupies the same part of the body as a listed piece, so nothing shows through or layers incorrectly.",
  "Render realistic fit, drape, seams, fabric texture, print placement and proportion, consistent with how the garment hangs on a real body.",
].join(" ");

/** What each role means on the body, so the sheet is read correctly. */
const ROLE_HINT: Record<string, string> = {
  top: "worn on the upper body",
  bottom: "worn on the lower body",
  dress: "a full-length dress covering torso and legs, replacing any separate top and bottom",
  outerwear: "layered over the top",
  shoes: "worn on the feet",
  accessory: "worn as an accessory",
  other: "worn as shown",
};

function roleOf(item: PromptItem): string {
  const c = (item.role ?? item.category ?? "").toLowerCase();
  return ROLE_HINT[c] ? c : "other";
}

/**
 * Builds the instruction sent alongside the person image and the composed
 * garment sheet.
 *
 * `fresh` marks a regenerate. It asks for a different interpretation rather
 * than a different person — the identity rules still apply in full.
 */
export function buildPrompt(items: PromptItem[], opts: { fresh?: boolean } = {}): string {
  const list = items
    .map((item, i) => {
      const role = roleOf(item);
      return `${i + 1}. ${item.name} — ${ROLE_HINT[role]}`;
    })
    .join("\n");

  const sheetNote =
    items.length > 1
      ? `The garment image is a reference sheet containing ${items.length} separate pieces laid out side by side on a white background. Dress the person in all ${items.length} of them together as one outfit. The white background and the layout of the sheet are not part of any garment.`
      : "The garment image shows a single piece to put on the person.";

  const parts = [
    "Virtual try-on.",
    IDENTITY_RULES,
    sheetNote,
    GARMENT_RULES,
    `Pieces to put on:\n${list}`,
    "Produce one photorealistic image of the same person wearing this outfit.",
  ];

  if (opts.fresh) {
    parts.push(
      "Render a fresh interpretation of how these garments fall and drape on the body. The person, pose, framing and background must stay identical.",
    );
  }

  return parts.join("\n\n");
}
