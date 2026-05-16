import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { Client } from "@gradio/client";

config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "20mb" }));

// POST /tryon/generate
// Body: { personImage: "data:image/...base64", garmentImage: "data:image/...base64", description: string }
// Returns: { ok: true, resultImage: "data:image/...base64" }
app.post("/tryon/generate", async (req, res) => {
  const { personImage, garmentImage, description = "clothing item" } = req.body;

  if (!personImage || !garmentImage) {
    return res.status(400).json({ error: "Person photo and garment image are required" });
  }

  try {
    const client = await Client.connect("yisol/IDM-VTON", {
      hf_token: process.env.HF_TOKEN,
    });

    const personBlob = dataUrlToBlob(personImage);
    const garmentBlob = dataUrlToBlob(garmentImage);

    const result = await client.predict("/tryon", [
      personBlob,
      garmentBlob,
      description,
      true,   // is_checked
      true,   // is_checked_crop
      30,     // denoise steps
      42,     // seed
    ]);

    const outputUrl = result.data?.[0]?.url;
    if (!outputUrl) throw new Error("No output from model");

    // Fetch result and convert to base64 so frontend doesn't need HF token
    const imgRes = await fetch(outputUrl);
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mime = imgRes.headers.get("content-type") || "image/png";

    res.json({ ok: true, resultImage: `data:${mime};base64,${base64}` });
  } catch (err) {
    console.error("Try-on error:", err.message);
    res.status(500).json({
      error: "Try-on failed. The HuggingFace Space may be loading or at capacity. Try again in a moment.",
    });
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Try-on service → http://localhost:${PORT}`));

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const bytes = Buffer.from(data, "base64");
  return new Blob([bytes], { type: mime });
}
