// Authentication & CSRF helpers. There are no user accounts — just a user/admin
// split. A single parent password (scrypt-hashed, stored in config) unlocks an
// admin session. State-changing admin requests additionally require a CSRF token.
import crypto from "node:crypto";
import session from "express-session";
import config from "./config.js";

const SCRYPT_KEYLEN = 64;

// Produce a self-describing hash string: scrypt$<saltHex>$<hashHex>.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// Constant-time verify. Returns false on any malformed/empty input.
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const actual = crypto.scryptSync(String(password), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// Session middleware. Cookie is httpOnly + SameSite=Strict and scoped to the
// app's base path. `secure` is left off because deployment is plain HTTP on the
// LAN behind nginx; SameSite=Strict still blocks cross-site cookie use.
export function sessionMiddleware() {
  return session({
    name: "cheevos.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      path: config.basePath || "/",
      maxAge: 1000 * 60 * 60 * 12, // 12h
    },
  });
}

// Ensure each session has a CSRF token; expose it for the client to echo back.
export function getCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  return req.session.csrfToken;
}

// Gate: require an authenticated admin session.
export function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Admin authentication required." });
}

// Gate: require a valid CSRF token on state-changing admin requests. Safe
// (read-only) methods are exempt. Compared in constant time against the session
// token.
export function requireCsrf(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const sent = req.get("x-csrf-token") || (req.body && req.body.csrfToken);
  const expected = req.session && req.session.csrfToken;
  if (
    sent &&
    expected &&
    sent.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
  ) {
    return next();
  }
  return res.status(403).json({ error: "Invalid or missing CSRF token." });
}
