// Account-level operations the user performs on themselves.
//
// Deletion is permanent and immediate, so it is deliberately a two-step flow:
// asking sends a fresh code to the registered address, and only that code
// completes it. Being signed in is not enough on its own — an unattended or
// stolen session should not be able to destroy someone's wardrobe.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, loadUser, clearSessionCookie } from "../services/auth.js";
import {
  generateOtp,
  issueOtpCookie,
  verifyOtpFromCookie,
  clearOtpCookie,
} from "../services/otp.js";
import { sendAccountDeletionEmail } from "../services/mailer.js";
import { deleteAccount, previewDeletion } from "../services/accountDeletion.js";
import { metric } from "../services/metrics.js";
import { overRateLimit } from "../services/rateLimit.js";

const router = Router();
router.use(requireAuth);

/**
 * A ceiling on deletion codes, so a hijacked session cannot bury the real
 * owner's inbox in warnings — the mail is alarming by design, and a flood of
 * it is its own kind of harm.
 *
 * Counted in the database rather than in memory: on serverless each instance
 * has its own memory, so a per-process counter spreads across enough instances
 * to never reach its own ceiling.
 */
const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 60 * 1000;

// GET /account/deletion-preview -> what deleting would destroy.
router.get("/deletion-preview", async (req, res) => {
  res.json(await previewDeletion(req.userId!));
});

// POST /account/delete/start -> emails a confirmation code.
router.post("/delete/start", async (req, res) => {
  const user = await loadUser(req.userId!);
  if (!user) return res.status(404).json({ error: "Account not found" });

  if (await overRateLimit("account:delete", req.userId!, MAX_REQUESTS, WINDOW_MS)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const otp = generateOtp();
  await issueOtpCookie(res, user.email, otp, "delete_account");
  try {
    await sendAccountDeletionEmail(user.email, otp);
  } catch (err) {
    console.error("sendAccountDeletionEmail failed:", err);
    return res.status(500).json({ error: "Could not send the confirmation email. Try again." });
  }
  metric("account_deletion_requested", { userId: req.userId! });
  // Echoing the address back lets the confirm screen say where the code went,
  // and the client already knows it.
  res.json({ ok: true, email: user.email });
});

// POST /account/delete/confirm { otp } -> deletes the account. Irreversible.
router.post("/delete/confirm", async (req, res) => {
  const parse = z.object({ otp: z.string().trim().length(6) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Enter the 6-digit code" });

  const user = await loadUser(req.userId!);
  if (!user) return res.status(404).json({ error: "Account not found" });

  const check = await verifyOtpFromCookie(req, res, user.email, parse.data.otp, "delete_account");
  if (!check.ok) {
    const msg = {
      no_request: "No code was requested — start again",
      expired: "Code expired — request a new one",
      too_many_attempts: "Too many attempts — request a new code",
      wrong: "Incorrect code",
      email_mismatch: "This code was issued for a different account",
    }[check.reason];
    return res.status(400).json({ error: msg });
  }

  clearOtpCookie(res, "delete_account");

  const result = await deleteAccount(req.userId!);

  // The session token is a stateless JWT and stays cryptographically valid for
  // its full life, so clearing the cookie is what actually ends the session in
  // the browser. Nothing it could authenticate as exists any more regardless.
  clearSessionCookie(res);

  res.json({ ok: true, ...result });
});

export default router;
