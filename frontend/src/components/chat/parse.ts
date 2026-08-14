// Turns a raw assistant message into renderable segments. Everything here is
// tolerant: the model is asked for a format, not trusted to produce it, so any
// malformed block degrades to plain text rather than breaking the transcript.

export type Outfit = { title: string; clothIds: string[]; why?: string };

export type Segment =
  | { type: "text"; value: string }
  | { type: "cloth"; id: string }
  | { type: "outfit"; outfit: Outfit }
  /** An outfit block that hasn't finished streaming — render a skeleton. */
  | { type: "outfit-pending" };

const OUTFIT_OPEN = "[[outfit]]";
const OUTFIT_CLOSE = "[[/outfit]]";

// `[cloth: <id>]` as emitted by the system prompt, tolerant of stray spaces.
const CLOTH_TOKEN = /\[cloth:\s*([^\]\s]+)\s*\]/g;

function parseOutfit(raw: string): Outfit | null {
  try {
    const o = JSON.parse(raw);
    const ids = Array.isArray(o?.clothIds)
      ? o.clothIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
      : [];
    if (ids.length === 0) return null;
    return {
      title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Outfit idea",
      clothIds: ids.slice(0, 5),
      why: typeof o.why === "string" && o.why.trim() ? o.why.trim() : undefined,
    };
  } catch {
    return null;
  }
}

function pushText(out: Segment[], value: string) {
  if (value.trim()) out.push({ type: "text", value });
}

/** Splits the text on `[cloth: id]` tokens. */
function pushWithClothTokens(out: Segment[], text: string) {
  const re = new RegExp(CLOTH_TOKEN.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    pushText(out, text.slice(last, m.index));
    out.push({ type: "cloth", id: m[1] });
    last = m.index + m[0].length;
  }
  pushText(out, text.slice(last));
}

export function parseAssistant(text: string): Segment[] {
  const out: Segment[] = [];
  let rest = text;

  while (true) {
    const open = rest.indexOf(OUTFIT_OPEN);
    if (open === -1) break;

    pushWithClothTokens(out, rest.slice(0, open));
    const afterOpen = rest.slice(open + OUTFIT_OPEN.length);
    const close = afterOpen.indexOf(OUTFIT_CLOSE);

    if (close === -1) {
      // Still arriving. Show a placeholder and drop the partial JSON — half a
      // brace on screen looks broken.
      out.push({ type: "outfit-pending" });
      return out;
    }

    const outfit = parseOutfit(afterOpen.slice(0, close).trim());
    if (outfit) out.push({ type: "outfit", outfit });
    // A block we couldn't parse is simply dropped; the prose around it stands
    // on its own.
    rest = afterOpen.slice(close + OUTFIT_CLOSE.length);
  }

  pushWithClothTokens(out, rest);
  return out;
}
