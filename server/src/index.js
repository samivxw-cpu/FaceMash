import express from "express";
import session from "express-session";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";
import "./db.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", 1);

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "facemash.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSameSite,
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  })
);

app.use("/uploads", express.static(path.resolve(__dirname, "..", "uploads")));

app.use("/auth", authRoutes);
app.use("/api", apiRoutes);

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "facemash-backend",
    frontend: config.frontendOrigin,
  });
});

app.listen(config.port, () => {
  console.log(`FaceMash backend running on port ${config.port}`);
});
