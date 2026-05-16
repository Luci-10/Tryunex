import { Router } from "express";

const router = Router();

router.post("/suggest", async (req, res) => {
  const { occasion, items } = req.body;
  if (!occasion || !items?.length) {
    return res.status(400).json({ error: "Occasion and items are required" });
  }

  const prompt = `You are a wardrobe stylist. Available clothing:
${items.map((i) => `- ${i.name} (${i.type}, ${i.color})`).join("\n")}

Suggest the best outfit for: "${occasion}"

Respond ONLY with JSON in this exact format:
{"top":"item name or null","bottom":"item name or null","shoes":"item name or null","extra":"item name or null","reason":"one sentence why"}`;

  // Try Ollama locally first (Gemma 3)
  try {
    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gemma3", prompt, stream: false, format: "json" }),
      signal: AbortSignal.timeout(15000),
    });

    if (ollamaRes.ok) {
      const { response } = await ollamaRes.json();
      const match = response.match(/\{[\s\S]*?\}/);
      if (match) {
        return res.json({ ok: true, suggestion: JSON.parse(match[0]), source: "ollama/gemma3" });
      }
    }
  } catch {
    // Ollama not running — fall through to Groq
  }

  // Groq free tier fallback (llama-3 or gemma on Groq)
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({
      error: "Start Ollama (`ollama run gemma3`) or add GROQ_API_KEY to backend/.env",
    });
  }

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!groqRes.ok) {
    const err = await groqRes.text();
    console.error("Groq error:", err);
    return res.status(502).json({ error: "AI service unavailable. Try again." });
  }

  const groqData = await groqRes.json();
  const suggestion = JSON.parse(groqData.choices[0].message.content);
  res.json({ ok: true, suggestion, source: "groq/llama3" });
});

export default router;
