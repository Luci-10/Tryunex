// Applies generated Drizzle SQL migrations to Neon over HTTPS (no port 5432).
// Run after `drizzle-kit generate` so the SQL files exist.
import "dotenv/config";
import "../services/http-tune.js";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import path from "node:path";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  console.log(`Applying migrations from ${migrationsFolder} via Neon HTTP …`);
  await migrate(db, { migrationsFolder });
  console.log("✓ Migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
