import Database from "better-sqlite3";
import { config } from "./config.js";

const db = new Database(config.dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_sub)
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  relationship_status TEXT NOT NULL,
  country_code TEXT NOT NULL,
  identity_type TEXT NOT NULL,
  identity_file_path TEXT NOT NULL,
  profile_photo_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const upsertUserStmt = db.prepare(`
  INSERT INTO users (provider, provider_sub, email, name, avatar_url)
  VALUES (@provider, @providerSub, @email, @name, @avatarUrl)
  ON CONFLICT(provider, provider_sub) DO UPDATE SET
    email = excluded.email,
    name = excluded.name,
    avatar_url = excluded.avatar_url
`);

const findUserStmt = db.prepare(`
  SELECT id, provider, provider_sub AS providerSub, email, name, avatar_url AS avatarUrl, created_at AS createdAt
  FROM users
  WHERE provider = ? AND provider_sub = ?
`);

const findUserByIdStmt = db.prepare(`
  SELECT id, provider, provider_sub AS providerSub, email, name, avatar_url AS avatarUrl, created_at AS createdAt
  FROM users
  WHERE id = ?
`);

const insertKycStmt = db.prepare(`
  INSERT INTO kyc_submissions (
    user_id,
    full_name,
    email,
    birth_date,
    relationship_status,
    country_code,
    identity_type,
    identity_file_path,
    profile_photo_path,
    status
  ) VALUES (
    @userId,
    @fullName,
    @email,
    @birthDate,
    @relationshipStatus,
    @countryCode,
    @identityType,
    @identityFilePath,
    @profilePhotoPath,
    @status
  )
`);

const findLatestKycStmt = db.prepare(`
  SELECT id, status, created_at AS createdAt
  FROM kyc_submissions
  WHERE user_id = ?
  ORDER BY id DESC
  LIMIT 1
`);

export function upsertUser(user) {
  upsertUserStmt.run(user);
  return findUserStmt.get(user.provider, user.providerSub);
}

export function getUserById(id) {
  return findUserByIdStmt.get(id);
}

export function insertKycSubmission(payload) {
  const result = insertKycStmt.run(payload);
  return result.lastInsertRowid;
}

export function getLatestKycByUserId(userId) {
  return findLatestKycStmt.get(userId) || null;
}
