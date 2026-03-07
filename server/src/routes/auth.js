import { Router } from "express";
import { finishAppleAuth, finishGoogleAuth, logout, startAppleAuth, startGoogleAuth } from "../oauth.js";

const router = Router();

router.get("/google", startGoogleAuth);
router.get("/google/callback", finishGoogleAuth);

router.get("/apple", startAppleAuth);
router.post("/apple/callback", finishAppleAuth);
router.get("/apple/callback", finishAppleAuth);

router.get("/logout", logout);

export default router;
