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

  // TEMPORARY: drops old tables from a previous app that was sharing this
  // database and creates the tables this app expects, with UUID FKs to
  // match the existing users.id. Idempotent — safe to call multiple times.
  // Remove once the schema is in place.
  app.get("/api/_debug/migrate", async (_req, res) => {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    const log: { step: string; ok: boolean; error?: string }[] = [];
    async function run(step: string, q: Promise<unknown>) {
      try {
        await q;
        log.push({ step, ok: true });
      } catch (e: any) {
        log.push({ step, ok: false, error: e?.message ?? String(e) });
      }
    }
    await run("drop closet_members", sql`DROP TABLE IF EXISTS "closet_members" CASCADE`);
    await run("drop closets", sql`DROP TABLE IF EXISTS "closets" CASCADE`);
    await run("drop items", sql`DROP TABLE IF EXISTS "items" CASCADE`);
    await run("drop outfits", sql`DROP TABLE IF EXISTS "outfits" CASCADE`);
    await run(
      "type cloth_status",
      sql`DO $$ BEGIN CREATE TYPE "cloth_status" AS ENUM('clean','worn'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await run(
      "type share_permission",
      sql`DO $$ BEGIN CREATE TYPE "share_permission" AS ENUM('view','suggest','edit'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await run(
      "type suggestion_status",
      sql`DO $$ BEGIN CREATE TYPE "suggestion_status" AS ENUM('pending','accepted','declined'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await run(
      "table clothes",
      sql`CREATE TABLE IF NOT EXISTS "clothes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "category" text NOT NULL DEFAULT 'other',
        "image_url" text NOT NULL,
        "status" "cloth_status" NOT NULL DEFAULT 'clean',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await run("idx clothes_user", sql`CREATE INDEX IF NOT EXISTS "clothes_user_idx" ON "clothes" ("user_id")`);
    await run(
      "table wear_events",
      sql`CREATE TABLE IF NOT EXISTS "wear_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "cloth_id" uuid NOT NULL REFERENCES "clothes"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "worn_on" date NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await run("idx wear_user", sql`CREATE INDEX IF NOT EXISTS "wear_user_idx" ON "wear_events" ("user_id")`);
    await run("idx wear_date", sql`CREATE INDEX IF NOT EXISTS "wear_date_idx" ON "wear_events" ("worn_on")`);
    await run(
      "table share_codes",
      sql`CREATE TABLE IF NOT EXISTS "share_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "code" text NOT NULL,
        "permission" "share_permission" NOT NULL DEFAULT 'suggest',
        "used" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await run("idx share_codes_code", sql`CREATE UNIQUE INDEX IF NOT EXISTS "share_codes_code_idx" ON "share_codes" ("code")`);
    await run(
      "table shares",
      sql`CREATE TABLE IF NOT EXISTS "shares" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "viewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "permission" "share_permission" NOT NULL DEFAULT 'suggest',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await run("idx shares_pair", sql`CREATE UNIQUE INDEX IF NOT EXISTS "shares_pair_idx" ON "shares" ("owner_id","viewer_id")`);
    await run(
      "table suggestions",
      sql`CREATE TABLE IF NOT EXISTS "suggestions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "suggester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "cloth_ids" text NOT NULL,
        "note" text,
        "for_date" date,
        "status" "suggestion_status" NOT NULL DEFAULT 'pending',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    res.json({ log });
  });

  // TEMPORARY: wipe all clothes rows. Use to reset state during upload debugging.
  app.get("/api/_debug/wipe-clothes", async (_req, res) => {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    try {
      const before = await sql`SELECT COUNT(*)::int AS n FROM clothes`;
      await sql`DELETE FROM clothes`;
      const after = await sql`SELECT COUNT(*)::int AS n FROM clothes`;
      res.json({ before, after });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

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
