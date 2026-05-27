// Cloudflare R2 (S3-compatible) presigned PUT URLs without the AWS SDK.
// The full SDK bundle broke Vercel's @vercel/node packager; this implements
// just the S3 SigV4 query-string signing we actually need (~80 lines vs ~2MB).
import { createHash, createHmac } from "node:crypto";

function envOr(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set — R2 storage is not configured`);
  return v;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function hmac(key: string | Buffer, msg: string): Buffer {
  return createHmac("sha256", key).update(msg).digest();
}

// AWS strict URI encoding: encodeURIComponent + the few chars it leaves alone.
// Path segments keep "/" but everything else gets percent-encoded.
function awsEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}
function encodePath(p: string): string {
  return p.split("/").map(awsEncode).join("/");
}

function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  const kDate = hmac("AWS4" + secret, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export async function presignPut(
  key: string,
  _contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const accountId = envOr("R2_ACCOUNT_ID");
  const accessKeyId = envOr("R2_ACCESS_KEY_ID");
  const secret = envOr("R2_SECRET_ACCESS_KEY");
  const bucket = envOr("R2_BUCKET");
  const publicBase = envOr("R2_PUBLIC_BASE_URL").replace(/\/$/, "");

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const expiresIn = 300;

  // YYYYMMDDTHHMMSSZ
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${encodePath(`${bucket}/${key}`)}`;

  const queryParams: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = queryParams
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmac(
    signingKey(secret, dateStamp, region, service),
    stringToSign,
  ).toString("hex");

  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const publicUrl = `${publicBase}/${encodePath(key)}`;
  return { uploadUrl, publicUrl };
}

export function r2PublicBase(): string {
  return envOr("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
}
