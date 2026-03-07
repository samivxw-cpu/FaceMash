import path from "path";
import { Router } from "express";
import multer from "multer";
import { calculateAge, requiredMajorAge } from "../ageRules.js";
import { getLatestKycByUserId, getUserById, insertKycSubmission } from "../db.js";
import { config } from "../config.js";

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "facemash-backend" });
});

router.get("/me", (req, res) => {
  if (!req.session.userId) {
    res.json({ authenticated: false });
    return;
  }

  const user = getUserById(req.session.userId);
  if (!user) {
    req.session.userId = null;
    res.json({ authenticated: false });
    return;
  }

  const latestKyc = getLatestKycByUserId(user.id);
  res.json({ authenticated: true, user, latestKyc });
});

router.post(
  "/kyc/submit",
  requireAuth,
  upload.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "identityFile", maxCount: 1 },
  ]),
  (req, res) => {
    const files = req.files || {};
    const profilePhoto = files.profilePhoto?.[0];
    const identityFile = files.identityFile?.[0];

    if (!profilePhoto || !identityFile) {
      res.status(400).json({ error: "Profile photo and identity document are required." });
      return;
    }

    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim();
    const birthDate = String(req.body.birthDate || "").trim();
    const relationshipStatus = String(req.body.relationshipStatus || "").trim();
    const countryCode = String(req.body.countryCode || "").trim().toLowerCase();
    const identityType = String(req.body.identityType || "").trim();
    const ageDeclaration = String(req.body.ageDeclaration || "").trim().toLowerCase() === "true";

    if (!fullName || !email || !birthDate || !relationshipStatus || !countryCode || !identityType) {
      res.status(400).json({ error: "Missing required fields." });
      return;
    }

    if (!ageDeclaration) {
      res.status(400).json({ error: "Legal age declaration is required." });
      return;
    }

    const age = calculateAge(birthDate);
    const minimumAge = requiredMajorAge(countryCode);

    if (age < minimumAge) {
      res.status(400).json({ error: `Minimum legal age for this country is ${minimumAge}.` });
      return;
    }

    const submissionId = insertKycSubmission({
      userId: req.session.userId,
      fullName,
      email,
      birthDate,
      relationshipStatus,
      countryCode,
      identityType,
      identityFilePath: path.basename(identityFile.path),
      profilePhotoPath: path.basename(profilePhoto.path),
      status: "pending",
    });

    res.json({
      ok: true,
      submissionId,
      status: "pending",
      message: "KYC submitted. Manual review is required before account approval.",
    });
  }
);

export default router;
