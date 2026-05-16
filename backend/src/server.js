import "./load-env.js";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import aiRoutes from "./routes/ai.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Backend → http://localhost:${PORT}`));
