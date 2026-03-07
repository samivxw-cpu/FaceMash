import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export const config = {
  port: Number(process.env.PORT || 8787),
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5500",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-secret",
  cookieSecure: String(process.env.SESSION_COOKIE_SECURE || "false").toLowerCase() === "true",
  cookieSameSite: process.env.SESSION_COOKIE_SAMESITE || "lax",
  dbPath: path.join(rootDir, "data", "facemash.db"),
  uploadDir: path.join(rootDir, "uploads"),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || "",
    teamId: process.env.APPLE_TEAM_ID || "",
    keyId: process.env.APPLE_KEY_ID || "",
    privateKey: process.env.APPLE_PRIVATE_KEY || "",
    redirectUri: process.env.APPLE_REDIRECT_URI || "",
  },
};
