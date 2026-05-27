// Cloudflare R2 (S3-compatible) for image storage. Browser-direct uploads
// via short-lived presigned PUT URLs; reads via the bucket's public URL.
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set — R2 storage is not configured`);
  return v;
}

let cached: { client: S3Client; bucket: string; publicBase: string } | null = null;
function r2() {
  if (cached) return cached;
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const publicBase = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  cached = { client, bucket, publicBase };
  return cached;
}

export async function presignPut(key: string, contentType: string): Promise<{
  uploadUrl: string;
  publicUrl: string;
}> {
  const { client, bucket, publicBase } = r2();
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 300 });
  const publicUrl = `${publicBase}/${key}`;
  return { uploadUrl, publicUrl };
}

export function r2PublicBase(): string {
  return r2().publicBase;
}
