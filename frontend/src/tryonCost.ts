/**
 * Credit cost of a look, mirroring `creditsForItems` on the server.
 *
 * This copy exists only so the UI can show the cost before the request is
 * made. The server is still the authority — it recomputes the cost from the
 * garments it actually sends, and the debit happens there.
 */
export const MAX_LOOK_ITEMS = 5;

export function creditsForItems(itemCount: number): number {
  return itemCount >= 4 ? 2 : 1;
}

/** "3 items selected · 1 credit" */
export function costLabel(itemCount: number): string {
  const credits = creditsForItems(itemCount);
  return `${itemCount} item${itemCount === 1 ? "" : "s"} selected · ${credits} credit${
    credits === 1 ? "" : "s"
  }`;
}

export const TRYON_DISCLAIMER =
  "AI try-on is a visual styling preview. Fit and size may vary—choose your usual size based on garment details.";

export const PHOTO_TIP =
  "For the most accurate result, use a clear full-body photo in good light and wear fitted clothing so the AI can understand the outfit silhouette. Your photo stays private.";
