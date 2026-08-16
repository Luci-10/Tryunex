// FLUX Virtual Try-On via fal (`fal-ai/flux-pro/v1/vto`).
//
// The key lives only here, read from the environment. It is never returned to
// a client and never logged.
//
// One important property of this model, confirmed against both fal's schema
// and Black Forest Labs' own docs: it takes exactly ONE garment image. BFL's
// guidance is "If you want to generate an image with more than one garment,
// merge them into a single canvas first" — which is what garmentSheet.ts does.
// There is no multi-garment input field to use.

const ENDPOINT = "https://fal.run/fal-ai/flux-pro/v1/vto";

export type VtoResult = {
  imageUrl: string;
  contentType: string;
  seed: number | null;
  requestId: string | null;
  nsfw: boolean;
};

export class FalError extends Error {
  status: number;
  detail: string;
  constructor(message: string, status: number, detail = "") {
    super(message);
    this.name = "FalError";
    this.status = status;
    this.detail = detail;
  }
}

function key(): string {
  const k = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!k) throw new FalError("FAL_KEY not set — try-on is not configured", 500);
  return k;
}

/**
 * Preview mode: skip the provider and return a visibly-marked stand-in, so the
 * rest of the flow (selection, cost, credits, cache, download, share) can be
 * exercised without a funded fal account.
 *
 * Refused outright in production regardless of the flag. A fake try-on result
 * reaching a paying user is not a risk worth a config mistake.
 */
export function tryonMockEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.TRYON_MOCK === "1";
}

export function falConfigured(): boolean {
  return Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY);
}

/**
 * Runs one try-on. Both URLs must be publicly readable — fal fetches them
 * itself, so they are the R2 public URLs we already serve.
 *
 * `seed` is passed only for a regenerate: leaving it unset lets the provider
 * pick, and passing a fresh one guarantees a genuinely different sample rather
 * than the same image again.
 */
export async function runVirtualTryOn(input: {
  prompt: string;
  humanImageUrl: string;
  garmentImageUrl: string;
  seed?: number;
  timeoutMs?: number;
}): Promise<VtoResult> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    human_image_url: input.humanImageUrl,
    garment_image_url: input.garmentImageUrl,
    output_format: "jpeg",
  };
  if (typeof input.seed === "number") body.seed = input.seed;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 120_000);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${key()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new FalError(
      err?.name === "AbortError" ? "The try-on timed out" : "Could not reach the try-on service",
      504,
      String(err?.message ?? err),
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* provider returned non-JSON */
  }

  if (!res.ok) {
    // Never surface the provider's raw body to the client — it can echo the
    // request, including the signed URLs.
    const detail =
      json?.detail ?? json?.error ?? json?.message ?? text.slice(0, 400) ?? "unknown";
    throw new FalError("The try-on service refused the request", res.status, String(detail));
  }

  const image = json?.images?.[0];
  if (!image?.url) {
    throw new FalError("The try-on service returned no image", 502, text.slice(0, 400));
  }

  return {
    imageUrl: image.url,
    contentType: image.content_type ?? "image/jpeg",
    seed: typeof json?.seed === "number" ? json.seed : null,
    requestId: json?.request_id ?? null,
    nsfw: Array.isArray(json?.has_nsfw_concepts) ? Boolean(json.has_nsfw_concepts[0]) : false,
  };
}
