// Vercel serverless entry. All /api/* requests are routed here via the
// rewrite in vercel.json, which passes the original path as ?_path=... .
// We restore req.url so Express sees the full route and matches normally.
import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../backend/src/app.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const handler: Handler = (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const path = url.searchParams.get("_path");
  if (path !== null) {
    url.searchParams.delete("_path");
    const qs = url.searchParams.toString();
    req.url = `/api/${path}${qs ? `?${qs}` : ""}`;
  }
  (app as unknown as Handler)(req, res);
};

export default handler;
