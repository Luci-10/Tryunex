import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
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
