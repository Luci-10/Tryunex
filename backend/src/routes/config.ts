import { Router } from "express";
import { MINIMUM_AGE } from "../services/age.js";

const router = Router();

// Public, unauthenticated: the registration form needs the minimum age before
// anyone has an account. Nothing sensitive — one number the policy also states.
router.get("/", (_req, res) => res.json({ minimumAge: MINIMUM_AGE }));

export default router;
