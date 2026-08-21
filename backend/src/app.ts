import "dotenv/config";
import "./services/http-tune.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.js";
import clothesRoutes from "./routes/clothes.js";
import sharingRoutes from "./routes/sharing.js";
import historyRoutes from "./routes/history.js";
import chatRoutes from "./routes/chat.js";
import tryonRoutes from "./routes/tryon.js";
import contactRoutes from "./routes/contact.js";
import billingRoutes from "./routes/billing.js";
import onboardingRoutes from "./routes/onboarding.js";
import thriftRoutes from "./routes/thrift.js";
import mediaRoutes from "./routes/media.js";
import policyRoutes from "./routes/policy.js";
import notificationRoutes from "./routes/notifications.js";
import configRoutes from "./routes/config.js";
import accountRoutes from "./routes/account.js";

/**
 * Express 4 does not forward a rejected promise from an async handler to the
 * error middleware — the request simply never gets a response. On Vercel that
 * turns one thrown query into a 30s FUNCTION_INVOCATION_TIMEOUT instead of a
 * fast 500: expensive, and it hides the actual error.
 *
 * Walk the router tree once, after everything is mounted, and wrap each
 * handler so rejections reach next(err). Error middleware (arity 4) is left
 * alone. Deliberately defensive: if Express's internals ever change shape
 * this quietly does nothing rather than breaking startup.
 */
export function forwardAsyncErrors(app: express.Express) {
  const seen = new WeakSet<object>();

  function wrapHandlers(stack: any[]) {
    for (const layer of stack) {
      const fn = layer?.handle;
      if (typeof fn !== "function") continue;
      // Nested router (app.use("/api/clothes", router)) — recurse into it.
      if (Array.isArray(fn.stack)) {
        wrapStack(fn.stack);
        continue;
      }
      if (fn.length >= 4 || seen.has(fn)) continue;
      const wrapped = function (this: unknown, req: any, res: any, next: any) {
        let out: unknown;
        try {
          out = fn.call(this, req, res, next);
        } catch (err) {
          return next(err);
        }
        if (out && typeof (out as Promise<unknown>).catch === "function") {
          (out as Promise<unknown>).catch(next);
        }
        return out;
      };
      seen.add(wrapped);
      layer.handle = wrapped;
    }
  }

  function wrapStack(stack: any[]) {
    for (const layer of stack) {
      if (Array.isArray(layer?.route?.stack)) wrapHandlers(layer.route.stack);
      else wrapHandlers([layer]);
    }
  }

  try {
    const router = (app as any)._router ?? (app as any).router;
    if (Array.isArray(router?.stack)) wrapStack(router.stack);
  } catch (err) {
    console.error("[app] could not install async error forwarding", err);
  }
}

export function createApp() {
  const app = express();

  // CORS allowlist. Web is same-origin (no-op) but the Capacitor app runs
  // from https://localhost on Android and capacitor://localhost on iOS, so
  // those need to be explicitly allowed for cookie-bearing requests.
  const allowedOrigins = new Set<string>([
    "https://localhost",
    "capacitor://localhost",
    "https://www.tryunex.in",
    process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  ]);
  // Vercel preview deploys live at <project>-<hash>-<team>.vercel.app —
  // a different origin per push, so the explicit allowlist can't cover them.
  // Allow any vercel.app subdomain so previews of this branch (and others)
  // work without a manual config update.
  const VERCEL_HOST = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin / curl / server-to-server have no Origin header.
        if (!origin) return cb(null, true);
        if (allowedOrigins.has(origin)) return cb(null, true);
        if (VERCEL_HOST.test(origin)) return cb(null, true);
        cb(new Error(`CORS: origin not allowed: ${origin}`));
      },
      credentials: true,
    }),
  );

  // Cookies first, and deliberately before billing: cookie-parser reads
  // headers and never touches the body, so it does not disturb the webhook,
  // while requireAuth on the billing router cannot work without it. Mounted
  // after billing — as it was — every authed billing route answered 401,
  // because req.cookies was still undefined by the time it ran.
  app.use(cookieParser());

  // Billing mounts before the JSON parser: its webhook needs the raw body for
  // signature verification, so it must not pass through express.json().
  app.use("/api/billing", billingRoutes);

  app.use(express.json({ limit: "1mb" }));

  // Booleans only — never a value, a length, or a prefix. Enough to tell
  // "the env var never reached this deployment" apart from "the key is wrong",
  // which is otherwise guesswork against a serverless deploy.
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: process.env.VERCEL_ENV ?? "local",
      configured: {
        fal: Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        database: Boolean(process.env.DATABASE_URL),
        r2: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET),
        razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        // "smtp" means mail is signed for our own domain; "gmail" is the
        // fallback that lands sign-in codes in spam.
        mail: process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
          ? "smtp"
          : process.env.GMAIL_USER
            ? "gmail"
            : "none",
      },
    }),
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/clothes", clothesRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/tryon", tryonRoutes);
  app.use("/api/contact", contactRoutes);
  app.use("/api/onboarding", onboardingRoutes);
  app.use("/api/thrift", thriftRoutes);
  app.use("/api/media", mediaRoutes);
  app.use("/api/policy", policyRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/config", configRoutes);
  app.use("/api/account", accountRoutes);
  // sharing.ts owns /share/*, /friends/*, /suggestions/* — mounted under /api.
  app.use("/api", sharingRoutes);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message ?? "Server error" });
  });

  // Must run last: everything above is now mounted.
  forwardAsyncErrors(app);

  return app;
}

// Default export so Vercel's @vercel/node runtime picks it up.
const app = createApp();
export default app;
