// AI chat: streams Gemini Flash 2.5 responses over SSE. Same wire format
// the frontend expects (event: delta / data: {text}), so the React side
// doesn't change when we swap providers.
//
// Why Gemini Flash 2.5: $0.10/M input + $0.40/M output, ~92% cheaper than
// Claude Haiku for the same chat-assistant use case, generous free tier.
import { Router } from "express";
import { ensureThriftSchema } from "../services/thrift.js";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { clothes, wearEvents } from "../db/schema.js";
import { requireAuth } from "../services/auth.js";
import { consumeChat, getChatQuota, releaseChat } from "../services/billing/credits.js";
import { metric } from "../services/metrics.js";

const router = Router();
router.use(requireAuth);

let cachedClient: GoogleGenAI | null = null;
function client() {
  if (cachedClient) return cachedClient;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not set — chat is not configured");
  }
  cachedClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return cachedClient;
}

async function buildWardrobeContext(userId: string): Promise<string> {
  const rows = await db
    .select({
      id: clothes.id,
      name: clothes.name,
      category: clothes.category,
      status: clothes.status,
      styleTag: clothes.styleTag,
      // Same subquery the clothes list uses, so "what haven't I worn lately"
      // is answerable from real data instead of guesswork.
      lastWornOn: sql<string | null>`(
        SELECT MAX(we.worn_on)::text
          FROM wear_events we
         WHERE we.cloth_id = clothes.id AND we.settled = true
      )`,
    })
    .from(clothes)
    .where(eq(clothes.userId, userId))
    .orderBy(desc(clothes.createdAt));

  if (rows.length === 0) return "The user's wardrobe is empty.";

  const byCategory = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `Today is ${today}.`,
    "The user's wardrobe (id · name · status · style tag · last worn):",
  ];
  for (const [cat, items] of byCategory) {
    lines.push(`\n${cat.toUpperCase()}:`);
    for (const it of items) {
      lines.push(
        `  - ${it.id} · ${it.name} · ${it.status} · ${it.styleTag} · ${it.lastWornOn ?? "never worn"}`,
      );
    }
  }
  return lines.join("\n");
}

/** Raw driver, named apart from drizzle's own `sql` tag. */
function rawSql() {
  return neon(process.env.DATABASE_URL!);
}

const SYSTEM_BASE = `You are TryUnex, the user's personal wardrobe stylist. You help them pick outfits, plan what to wear, and get more out of the clothes they already own.

Voice:
- Concise, warm, practical. Short sentences. No filler, no hype.
- Refer to clothes by name, never by id, in your prose.

Hard rules:
- Only ever mention clothes that appear in the wardrobe list below. Never invent a garment, a brand, a colour you weren't told, or the weather.
- Each garment carries a style tag the user chose: casual, smart_casual, formal, party, sports, lounge, traditional or other. Match it to the request — an interview or anything formal leans on formal and smart_casual, a casual outing on casual, a party on party. It's a useful label the user picked, not a guarantee; don't describe anything as perfect for an occasion.
- If nothing carries a fitting tag, say so plainly and offer the closest thing they own.
- A garment in the "other" category has no defined place on the body. Don't assume it is a top, a jacket or anything else. If it would matter to the suggestion, ask the user what the piece actually is before building a look around it, and say that they can set its role in the Try-on studio.
- Prefer items marked "clean" for anything the user might wear now. If the best option is "worn", say so plainly and offer the closest clean alternative.
- If the wardrobe genuinely lacks something the request needs, say that honestly and suggest the nearest thing they do own.
- Don't claim anything has been saved, planned or scheduled. The user does that themselves from the cards you produce.
- The wardrobe comes first. Only reach for Thrift when what they own genuinely cannot answer the request, and say plainly why their own clothes fall short before offering one.
- Never mix a Thrift piece into an outfit card. Those are built from clothes they already own.
- Thrift items belong to other people and may sell at any time. Suggest, never promise.

Recommending a complete outfit (2-3 garments that go together):
Emit exactly one line in this format, on its own line, and nothing else on that line:
[[outfit]]{"title":"Easy dinner look","clothIds":["id1","id2"],"why":"Soft neutrals with one warm accent."}[[/outfit]]
- title: 2-4 words.
- clothIds: 2-3 ids copied exactly from the wardrobe list.
- why: one short sentence on why it works. Optional but preferred.
- You may add a sentence of prose before it. Don't repeat the garment names after it — the card shows them.
- Emit at most two of these per reply.

Mentioning a single garment (not a full outfit):
Put it on its own line as:
[cloth: <id>]

Pointing at something on Thrift (only when the wardrobe cannot answer the request):
Put it on its own line as:
[thrift: <id>]
- Copy the id exactly from the Thrift list.
- At most two per reply, and only after saying what their own clothes are missing.

If you are only answering a question and recommending nothing, just answer in plain prose.`;

/**
 * Pieces other members are selling that the user could actually buy.
 *
 * Kept deliberately small. The stylist's job is to work with what someone
 * owns; Thrift is a suggestion of last resort, for when the wardrobe genuinely
 * lacks something. Feeding it the whole marketplace would tempt it to shop
 * instead of style, and would crowd out the wardrobe it is supposed to know.
 *
 * Blocked accounts are excluded in both directions, and a member's own
 * listings never come back — being sold your own jacket is not advice.
 */
async function buildThriftContext(userId: string): Promise<string> {
  await ensureThriftSchema();
  const q = rawSql();
  const rows = (await q`
    SELECT l.id, l.title, l.category, l.style_tag, l.size, l.condition, l.price_paise, l.city
      FROM thrift_listings l
     WHERE l.status = 'active'
       AND l.seller_user_id <> ${userId}
       AND NOT EXISTS (
         SELECT 1 FROM thrift_blocks b
          WHERE (b.blocker_user_id = ${userId} AND b.blocked_user_id = l.seller_user_id)
             OR (b.blocker_user_id = l.seller_user_id AND b.blocked_user_id = ${userId})
       )
     ORDER BY l.created_at DESC
     LIMIT 40`) as any[];

  if (rows.length === 0) return "\n\nThrift has nothing listed right now.";

  const lines = rows.map((r) => {
    const price = `₹${Math.round(Number(r.price_paise) / 100)}`;
    const bits = [r.category, r.style_tag, `size ${r.size}`, String(r.condition).replace(/_/g, " "), price, r.city]
      .filter(Boolean)
      .join(", ");
    return `- ${r.title} (${bits}) [thrift id ${r.id}]`;
  });
  return `\n\nOn Thrift, other members are currently selling:\n${lines.join("\n")}`;
}

router.post("/", async (req, res) => {
  const parse = z
    .object({
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(4000),
          }),
        )
        .min(1)
        .max(40),
      attachedClothId: z.string().optional(),
      // Optional styling hints from the composer's context chips. Additive:
      // clients that don't send it behave exactly as before.
      context: z
        .object({
          occasion: z.string().max(40).optional(),
          mood: z.string().max(40).optional(),
          date: z.string().max(20).optional(),
          weather: z.string().max(60).optional(),
        })
        .optional(),
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const userId = req.userId!;
  const [wardrobe, thrift] = await Promise.all([
    buildWardrobeContext(userId),
    buildThriftContext(userId),
  ]);

  let attachedNote = "";
  if (parse.data.attachedClothId) {
    const row = await db
      .select()
      .from(clothes)
      .where(eq(clothes.id, parse.data.attachedClothId))
      .limit(1);
    if (row[0] && row[0].userId === userId) {
      attachedNote = `\n\nThe user is currently looking at: "${row[0].name}" (${row[0].category}, id ${row[0].id}). Treat this as the focus of the question unless they say otherwise.`;
    }
  }

  const ctx = parse.data.context;
  const contextNote =
    ctx && (ctx.occasion || ctx.mood || ctx.date || ctx.weather)
      ? "\n\nThe user set these preferences for this request:" +
        (ctx.occasion ? `\n- Occasion: ${ctx.occasion}` : "") +
        (ctx.mood ? `\n- Style mood: ${ctx.mood}` : "") +
        (ctx.date ? `\n- Planning for: ${ctx.date}` : "") +
        (ctx.weather ? `\n- Weather they reported: ${ctx.weather}` : "") +
        "\nHonour them. Don't invent any weather they didn't state."
      : "";

  let ai: GoogleGenAI;
  try {
    ai = client();
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "chat misconfigured" });
  }

  // Free tier gets a monthly chat allowance; paid tiers are uncapped. The
  // count is taken here, before any tokens are spent, and released below if
  // the model never produced a response.
  const gate = await consumeChat(userId);
  if (!gate.allowed) {
    metric("chat_limit_reached", { userId });
    return res.status(429).json({
      code: "CHAT_LIMIT_REACHED",
      error: "You've used your free styling chats for this month",
      chat: gate.quota,
    });
  }
  let produced = false;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Gemini uses "model" for assistant turns; convert from our wire format.
  const contents = parse.data.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: SYSTEM_BASE + "\n\n" + wardrobe + thrift + attachedNote + contextNote,
        maxOutputTokens: 1024,
      },
    });
    let usage: { input?: number; output?: number } = {};
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        produced = true;
        send("delta", { text });
      }
      if (chunk.usageMetadata) {
        usage = {
          input: chunk.usageMetadata.promptTokenCount,
          output: chunk.usageMetadata.candidatesTokenCount,
        };
      }
    }
    if (!produced) await releaseChat(userId);
    else metric("chat_used", { userId });
    send("done", { usage, chat: await getChatQuota(userId) });
  } catch (e: any) {
    console.error("[chat] error", e);
    // A failed request must not eat someone's allowance.
    if (!produced) await releaseChat(userId);
    send("error", { message: e?.message ?? "chat failed" });
  } finally {
    res.end();
  }
});

export default router;
