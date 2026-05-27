import "dotenv/config";
import "./services/http-tune.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.js";
import clothesRoutes from "./routes/clothes.js";
import sharingRoutes from "./routes/sharing.js";
import historyRoutes from "./routes/history.js";
import { UPLOAD_DIR } from "./services/upload.js";

export function createApp() {
  const app = express();

  // CORS only matters in dev when frontend runs on a different origin.
  // On Vercel (single project) the request is same-origin and CORS is a no-op.
  const allowedOrigin = process.env.FRONTEND_ORIGIN;
  if (allowedOrigin) {
    app.use(cors({ origin: allowedOrigin, credentials: true }));
  }

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Dev-only: serve locally-stored uploads. In production (Vercel Blob),
  // image URLs are absolute blob URLs and never hit this path.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d" }));
  }

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // TEMPORARY: diagnose schema mismatches behind upload/list hangs. Remove
  // once /api/clothes is confirmed working.
  app.get("/api/_debug/db", async (_req, res) => {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    const out: Record<string, unknown> = {};
    try {
      out.tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
      out.users_columns = await sql`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position`;
      out.clothes_columns = await sql`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='clothes' ORDER BY ordinal_position`;
      try {
        const t0 = Date.now();
        const c = await sql`SELECT COUNT(*)::int AS n FROM clothes`;
        out.clothes_count = { rows: c, ms: Date.now() - t0 };
      } catch (e: any) {
        out.clothes_count_error = { message: e?.message, code: e?.code };
      }
    } catch (e: any) {
      out.error = { message: e?.message, code: e?.code };
    }
    res.json(out);
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/clothes", clothesRoutes);
  app.use("/api/history", historyRoutes);
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
