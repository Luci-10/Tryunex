import { SignJWT, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "tryunex_session";
const PENDING_COOKIE = "tryunex_pending";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not set");
  return new TextEncoder().encode(s);
}

export async function signSessionToken(userId: string | number) {
  return new SignJWT({ sub: String(userId), kind: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

// "pending" = email verified, but no user row yet. Carries the email.
export async function signPendingToken(email: string) {
  return new SignJWT({ email, kind: "pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret());
}

const isDev = process.env.NODE_ENV === "development";

// SameSite=None+Secure so the Capacitor Android app (origin
// https://localhost) can read/send these cookies against www.tryunex.in.
// Lax would block them on cross-origin requests. Modern browsers handle
// None+Secure correctly; Safari < 13.1 doesn't (rounding-error market share).
//
// On local dev (plain HTTP), Secure must be false or the browser/emulator
// will drop the cookie.
const baseCookieOpts = {
  httpOnly: true,
  sameSite: (isDev ? "lax" : "none") as const,
  secure: !isDev,
  path: "/",
};

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...baseCookieOpts, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

export function setPendingCookie(res: Response, token: string) {
  res.cookie(PENDING_COOKIE, token, { ...baseCookieOpts, maxAge: 15 * 60 * 1000 });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...baseCookieOpts });
}

export function clearPendingCookie(res: Response) {
  res.clearCookie(PENDING_COOKIE, { ...baseCookieOpts });
}

// JWT sub is always a string. The deployed DB uses UUIDs for user IDs even
// though the schema declares `serial` — keep the value as-is and let drizzle
// pass it through to Postgres.
export async function getUserIdFromSession(req: Request): Promise<string | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "session" || typeof payload.sub !== "string" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function getPendingEmail(req: Request): Promise<string | null> {
  const token = req.cookies?.[PENDING_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "pending") return null;
    return String(payload.email);
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const id = await getUserIdFromSession(req);
  if (!id) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.userId = id;
  next();
}

export async function loadUser(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}
