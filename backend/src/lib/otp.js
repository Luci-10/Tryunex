import "dotenv/config";
import crypto from "crypto";

const SECRET = process.env.OTP_SECRET;

export function createToken(email, otp) {
  const exp = Date.now() + 15 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(`${payload}.${otp}`).digest("hex");
  return `${payload}.${mac}`;
}

export function verifyToken(token, email, otp) {
  if (!token || !email || !otp) return false;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return false;

  const payload = token.slice(0, dotIdx);
  const mac = token.slice(dotIdx + 1);

  const expectedMac = crypto
    .createHmac("sha256", SECRET)
    .update(`${payload}.${otp}`)
    .digest("hex");

  const macBuf = Buffer.from(mac, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");
  if (macBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(macBuf, expectedBuf)) return false;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return false;
  }

  if (data.email !== email) return false;
  if (Date.now() > data.exp) return false;
  return true;
}
