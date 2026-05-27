// Stateless OTP via signed cookie. No DB, no in-memory store.
//
// /auth/start  → generate 6-digit OTP, hash it with HMAC-SHA256(JWT_SECRET),
//                sign {email, otpHash, attempts:0, iat} into a 10-min JWT cookie,
//                email the *plaintext* OTP to the user.
// /auth/verify → read the cookie, hash the submitted OTP, compare in constant time.
//                If wrong, re-issue the cookie with attempts+1 (capped at 5).
//                If right, clear the cookie.
//
// All state lives in the cookie; works the same on a single Node process and on
// Vercel serverless because there is no shared in-memory state to keep.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const OTP_COOKIE = "wordrobe_otp";
const TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

type OtpPayload = JWTPayload & {
  email: string;
  otpHash: string;
  attempts: number;
};

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not set");
  return new TextEncoder().encode(s);
}

function hashOtp(email: string, otp: string): string {
  // Bind hash to the email so the cookie can't be replayed under a different email.
  return createHmac("sha256", process.env.JWT_SECRET!).update(`${email}:${otp}`).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function issueOtpCookie(res: Response, email: string, otp: string) {
  const payload: OtpPayload = {
    email,
    otpHash: hashOtp(email, otp),
    attempts: 0,
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
  res.cookie(OTP_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS * 1000,
  });
}

export function clearOtpCookie(res: Response) {
  res.clearCookie(OTP_COOKIE, { path: "/" });
}

export async function readOtpCookie(req: Request): Promise<OtpPayload | null> {
  const token = req.cookies?.[OTP_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as OtpPayload;
  } catch {
    return null;
  }
}

export type OtpCheck =
  | { ok: true }
  | { ok: false; reason: "no_request" | "expired" | "too_many_attempts" | "wrong" | "email_mismatch" };

/**
 * Verify a user-submitted OTP against the cookie.
 *
 * On wrong code (and not yet at the attempt cap), re-issues the cookie with
 * attempts+1 so future tries on this session count against the limit.
 *
 * On success, the caller should call clearOtpCookie(res).
 */
export async function verifyOtpFromCookie(
  req: Request,
  res: Response,
  submittedEmail: string,
  submittedOtp: string,
): Promise<OtpCheck> {
  const payload = await readOtpCookie(req);
  if (!payload) return { ok: false, reason: "no_request" };

  if (payload.email !== submittedEmail.trim().toLowerCase()) {
    return { ok: false, reason: "email_mismatch" };
  }

  if ((payload.attempts ?? 0) >= MAX_ATTEMPTS) {
    clearOtpCookie(res);
    return { ok: false, reason: "too_many_attempts" };
  }

  const expectedHash = hashOtp(payload.email, submittedOtp.trim());
  if (constantTimeEqual(expectedHash, payload.otpHash)) {
    return { ok: true };
  }

  // Wrong code — re-issue cookie with attempts+1.
  const nextAttempts = (payload.attempts ?? 0) + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    clearOtpCookie(res);
    return { ok: false, reason: "too_many_attempts" };
  }
  // Preserve original exp by signing a fresh token with remaining TTL.
  const remainingSec = Math.max(30, (payload.exp ?? 0) - Math.floor(Date.now() / 1000));
  const newToken = await new SignJWT({
    email: payload.email,
    otpHash: payload.otpHash,
    attempts: nextAttempts,
  } satisfies OtpPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${remainingSec}s`)
    .sign(secret());
  res.cookie(OTP_COOKIE, newToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remainingSec * 1000,
  });
  return { ok: false, reason: "wrong" };
}
