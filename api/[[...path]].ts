// Vercel serverless entry. Forwards every /api/* request to the Express app.
// `app.ts` already mounts routes under /api/*, so we just hand the request off.
// Runtime / memory / duration are configured in vercel.json.
import app from "../backend/src/app.js";
export default app;
