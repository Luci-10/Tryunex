// Cloudflare R2 (S3-compatible) for image storage. Browser-direct uploads
// via short-lived presigned PUT URLs; reads via the bucket's public URL.
//
// The AWS SDK is heavy and only needed when generating an upload URL — load
// it dynamically so cold starts for unrelated routes (OTP, /clothes GET, etc.)
// don't pay the cost or risk an import-time crash.

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set — R2 storage is not configured`);
  return v;
}

let cached:
  | {
      client: import("@aws-sdk/client-s3").S3Client;
      PutObjectCommand: typeof import("@aws-sdk/client-s3").PutObjectCommand;
      getSignedUrl: typeof import("@aws-sdk/s3-request-presigner").getSignedUrl;
      bucket: string;
      publicBase: string;
    }
  | null = null;

async function r2() {
  if (cached) return cached;
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const publicBase = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  cached = { client, PutObjectCommand, getSignedUrl, bucket, publicBase };
  return cached;
}

export async function presignPut(key: string, contentType: string): Promise<{
  uploadUrl: string;
  publicUrl: string;
}> {
  const { client, PutObjectCommand, getSignedUrl, bucket, publicBase } = await r2();
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 300 });
  const publicUrl = `${publicBase}/${key}`;
  return { uploadUrl, publicUrl };
}

export function r2PublicBase(): string {
  return env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
}
