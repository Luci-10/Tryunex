import "dotenv/config";
import "./services/http-tune.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.js";
import clothesRoutes from "./routes/clothes.js";
import sharingRoutes from "./routes/sharing.js";
import historyRoutes from "./routes/history.js";
import chatRoutes from "./routes/chat.js";
import tryonRoutes from "./routes/tryon.js";

export function createApp() {
  const app = express();

  // CORS allowlist. Web is same-origin (no-op) but the Capacitor app runs
  // from https://localhost on Android and capacitor://localhost on iOS, so
  // those need to be explicitly allowed for cookie-bearing requests.
  const allowedOrigins = new Set<string>([
    "https://localhost",
    "capacitor://localhost",
    "https://www.tryunex.in",
    process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  ]);
  // Vercel preview deploys live at <project>-<hash>-<team>.vercel.app —
  // a different origin per push, so the explicit allowlist can't cover them.
  // Allow any vercel.app subdomain so previews of this branch (and others)
  // work without a manual config update.
  const VERCEL_HOST = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin / curl / server-to-server have no Origin header.
        if (!origin) return cb(null, true);
        if (allowedOrigins.has(origin)) return cb(null, true);
        if (VERCEL_HOST.test(origin)) return cb(null, true);
        cb(new Error(`CORS: origin not allowed: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/clothes", clothesRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/tryon", tryonRoutes);
  // sharing.ts owns /share/*, /friends/*, /suggestions/* — mounted under /api.
  app.use("/api", sharingRoutes);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message ?? "Server error" });
  });

  return app;
}

// Default export so Vercel's @vercel/node runtime picks it up.
const app = createApp();
export default app;
