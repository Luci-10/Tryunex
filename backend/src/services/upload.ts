import multer from "multer";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { put } from "@vercel/blob";

const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
// On Vercel the working directory is read-only — only /tmp is writable, and
// mkdirSync would throw at module load. Skip the local upload dir there;
// uploads in production must go through Vercel Blob (BLOB_READ_WRITE_TOKEN).
const IS_VERCEL = Boolean(process.env.VERCEL);

const LOCAL_DIR = path.resolve(process.cwd(), "uploads");
if (!USE_BLOB && !IS_VERCEL) mkdirSync(LOCAL_DIR, { recursive: true });

// Always parse to memory — works on serverless (no writable FS) and lets us
// hand the buffer off to either Vercel Blob or local disk.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

function safeExt(originalName: string): string {
  const raw = (originalName.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["jpg", "jpeg", "png", "webp", "heic"].includes(raw) ? raw : "jpg";
}

export async function saveUpload(file: Express.Multer.File): Promise<string> {
  const ext = safeExt(file.originalname);
  const filename = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;

  if (USE_BLOB) {
    const blob = await put(`clothes/${filename}`, file.buffer, {
      access: "public",
      contentType: file.mimetype,
      addRandomSuffix: false,
    });
    return blob.url;
  }

  // Dev fallback: write to local disk; backend serves /uploads/* statically.
  writeFileSync(path.join(LOCAL_DIR, filename), file.buffer);
  return `/uploads/${filename}`;
}

export const UPLOAD_DIR = LOCAL_DIR;
