import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));

export default defineConfig({
  plugins: [react()],
  // Real build metadata for the About / Settings pages — nothing invented.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    proxy: {
      // All backend traffic goes through /api/* (matches Vercel layout).
      "/api": "http://localhost:3001",
      // Dev-only: backend serves uploaded photos locally until Vercel Blob is configured.
      "/uploads": "http://localhost:3001",
    },
  },
});
