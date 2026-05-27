// Vercel serverless entry. Forwards every /api/* request to the Express app.
// `app.ts` already mounts routes under /api/*, so we just hand the request off.
import app from "../backend/src/app.js";
export default app;

export const config = {
  // Express + multer need the Node.js runtime (not the Edge runtime).
  runtime: "nodejs20.x",
  // Bumped from the 4MB default so photo uploads up to 8MB go through.
  api: { bodyParser: false },
};
