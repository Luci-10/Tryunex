import { Router } from "express";
import { requireAuth } from "../services/auth.js";
import { getPolicyStatus, acceptPolicy } from "../services/policy.js";

const router = Router();
router.use(requireAuth);

// Has this user accepted the current Terms and Privacy Policy?
router.get("/status", async (req, res) => {
  res.json(await getPolicyStatus(req.userId!));
});

// Records acceptance. The tick happens in the UI; this is the only place it
// is stored, and it is keyed to the signed-in user server-side — the client
// cannot record an acceptance for anyone else.
router.post("/accept", async (req, res) => {
  res.json(await acceptPolicy(req.userId!));
});

export default router;
