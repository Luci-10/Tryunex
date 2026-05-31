// AI chat: streams Gemini Flash 2.5 responses over SSE. Same wire format
// the frontend expects (event: delta / data: {text}), so the React side
// doesn't change when we swap providers.
//
// Why Gemini Flash 2.5: $0.10/M input + $0.40/M output, ~92% cheaper than
// Claude Haiku for the same chat-assistant use case, generous free tier.
import { Router } from "express";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { clothes } from "../db/schema.js";
import { requireAuth } from "../services/auth.js";

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
  const lines: string[] = ["The user's wardrobe (id · name · status):"];
  for (const [cat, items] of byCategory) {
    lines.push(`\n${cat.toUpperCase()}:`);
    for (const it of items) {
      lines.push(`  - ${it.id} · ${it.name} · ${it.status}`);
    }
  }
  return lines.join("\n");
}

const SYSTEM_BASE = `You are TryUnex, a friendly wardrobe assistant. You help the user pick outfits, plan what to wear, and care for their clothes.

Style:
- Concise. Use short sentences and bullet points.
- Reference clothes by name, not id.
- When suggesting outfits, pick 2-3 specific items from their wardrobe.
- Only suggest clothes that exist in the user's wardrobe.
- If the user has nothing fitting their request, say so honestly.

When you suggest specific clothes from the wardrobe, format each one on its own line as:
  [cloth: <id>]
The frontend renders these as clickable cards.`;

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
    })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });

  const userId = req.userId!;
  const wardrobe = await buildWardrobeContext(userId);

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

  let ai: GoogleGenAI;
  try {
    ai = client();
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "chat misconfigured" });
  }

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
        systemInstruction: SYSTEM_BASE + "\n\n" + wardrobe + attachedNote,
        maxOutputTokens: 1024,
      },
    });
    let usage: { input?: number; output?: number } = {};
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) send("delta", { text });
      if (chunk.usageMetadata) {
        usage = {
          input: chunk.usageMetadata.promptTokenCount,
          output: chunk.usageMetadata.candidatesTokenCount,
        };
      }
    }
    send("done", { usage });
  } catch (e: any) {
    console.error("[chat] error", e);
    send("error", { message: e?.message ?? "chat failed" });
  } finally {
    res.end();
  }
});

export default router;
