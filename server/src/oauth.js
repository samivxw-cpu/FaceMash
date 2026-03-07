import crypto from "crypto";
import { SignJWT, importPKCS8 } from "jose";
import { Issuer, generators } from "openid-client";
import { config } from "./config.js";
import { upsertUser } from "./db.js";

const providerCache = {
  google: null,
  apple: null,
};

function ensureGoogleConfig() {
  return Boolean(config.google.clientId && config.google.clientSecret && config.google.redirectUri);
}

function ensureAppleConfig() {
  return Boolean(
    config.apple.clientId &&
      config.apple.teamId &&
      config.apple.keyId &&
      config.apple.privateKey &&
      config.apple.redirectUri
  );
}

async function buildAppleClientSecret() {
  const privateKey = config.apple.privateKey.replace(/\\n/g, "\n");
  const key = await importPKCS8(privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.apple.keyId })
    .setIssuer(config.apple.teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 24 * 180)
    .setAudience("https://appleid.apple.com")
    .setSubject(config.apple.clientId)
    .sign(key);
}

async function getGoogleClient() {
  if (providerCache.google) return providerCache.google;

  const issuer = await Issuer.discover("https://accounts.google.com");
  providerCache.google = new issuer.Client({
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uris: [config.google.redirectUri],
    response_types: ["code"],
  });

  return providerCache.google;
}

async function getAppleClient() {
  const clientSecret = await buildAppleClientSecret();

  const issuer = await Issuer.discover("https://appleid.apple.com");
  return new issuer.Client({
    client_id: config.apple.clientId,
    client_secret: clientSecret,
    redirect_uris: [config.apple.redirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
  });
}

function sessionState(req) {
  if (!req.session.oauth) req.session.oauth = {};
  return req.session.oauth;
}

export async function startGoogleAuth(req, res) {
  if (!ensureGoogleConfig()) {
    res.status(503).json({ error: "Google OAuth is not configured on the server." });
    return;
  }

  const client = await getGoogleClient();
  const state = generators.state();
  const nonce = generators.nonce();

  sessionState(req).google = { state, nonce };

  const url = client.authorizationUrl({
    scope: "openid profile email",
    state,
    nonce,
    prompt: "select_account",
  });

  res.redirect(url);
}

export async function finishGoogleAuth(req, res) {
  if (!ensureGoogleConfig()) {
    res.status(503).send("Google OAuth not configured.");
    return;
  }

  try {
    const client = await getGoogleClient();
    const oauth = sessionState(req).google;

    if (!oauth || !oauth.state || !oauth.nonce) {
      res.status(400).send("Invalid OAuth session state.");
      return;
    }

    const params = client.callbackParams(req);
    const tokenSet = await client.callback(config.google.redirectUri, params, {
      state: oauth.state,
      nonce: oauth.nonce,
    });

    const profile = await client.userinfo(tokenSet);
    const user = upsertUser({
      provider: "google",
      providerSub: String(profile.sub || ""),
      email: String(profile.email || ""),
      name: String(profile.name || ""),
      avatarUrl: String(profile.picture || ""),
    });

    req.session.userId = user.id;
    sessionState(req).google = null;

    res.redirect(`${config.frontendOrigin}/FaceMash/account.html?auth=success`);
  } catch (error) {
    res.status(400).send(`Google OAuth failed: ${error.message}`);
  }
}

export async function startAppleAuth(req, res) {
  if (!ensureAppleConfig()) {
    res.status(503).json({ error: "Apple OAuth is not configured on the server." });
    return;
  }

  const client = await getAppleClient();
  const state = generators.state();
  const nonce = generators.nonce();

  sessionState(req).apple = { state, nonce };

  const url = client.authorizationUrl({
    scope: "name email",
    response_mode: "form_post",
    state,
    nonce,
  });

  res.redirect(url);
}

export async function finishAppleAuth(req, res) {
  if (!ensureAppleConfig()) {
    res.status(503).send("Apple OAuth not configured.");
    return;
  }

  try {
    const client = await getAppleClient();
    const oauth = sessionState(req).apple;

    if (!oauth || !oauth.state || !oauth.nonce) {
      res.status(400).send("Invalid OAuth session state.");
      return;
    }

    const params = client.callbackParams(req);
    const tokenSet = await client.callback(config.apple.redirectUri, params, {
      state: oauth.state,
      nonce: oauth.nonce,
    });

    const claims = tokenSet.claims();

    const rawName = (() => {
      if (!req.body || !req.body.user) return "";
      try {
        const parsed = JSON.parse(req.body.user);
        return `${parsed.name?.firstName || ""} ${parsed.name?.lastName || ""}`.trim();
      } catch {
        return "";
      }
    })();

    const user = upsertUser({
      provider: "apple",
      providerSub: String(claims.sub || ""),
      email: String(claims.email || ""),
      name: rawName || String(claims.email || "Apple user"),
      avatarUrl: "",
    });

    req.session.userId = user.id;
    sessionState(req).apple = null;

    res.redirect(`${config.frontendOrigin}/FaceMash/account.html?auth=success`);
  } catch (error) {
    res.status(400).send(`Apple OAuth failed: ${error.message}`);
  }
}

export function logout(req, res) {
  req.session.destroy(() => {
    res.redirect(`${config.frontendOrigin}/FaceMash/account.html?auth=logout`);
  });
}
