// Loads runtime configuration from config/config.json (falling back to the
// committed config.example.json), with environment-variable overrides. Kept
// dependency-free and synchronous so it can be imported anywhere at startup.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const real = readJson(path.join(root, "config", "config.json"));
const example = readJson(path.join(root, "config", "config.example.json")) || {};
const base = real || example;

// Normalize the base path: ensure a single leading slash and no trailing slash.
// "" means "mount at root".
function normalizeBasePath(p) {
  if (!p || p === "/") return "";
  let v = String(p).trim();
  if (!v.startsWith("/")) v = "/" + v;
  return v.replace(/\/+$/, "");
}

const config = {
  port: Number(process.env.PORT || base.port || 3000),
  host: process.env.HOST || base.host || "127.0.0.1",
  basePath: normalizeBasePath(process.env.BASE_PATH || base.basePath || "/cheevos"),
  sessionSecret:
    process.env.SESSION_SECRET ||
    base.sessionSecret ||
    crypto.randomBytes(32).toString("hex"),
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || base.adminPasswordHash || "",
  // Absolute path to the SQLite file (env override useful for tests).
  dbFile: process.env.DB_FILE || path.join(root, "data", "cheevos.db"),
  root,
};

config.usingExampleSecret =
  !process.env.SESSION_SECRET &&
  (!real || !real.sessionSecret || real.sessionSecret.includes("CHANGE_ME"));

config.adminConfigured = Boolean(config.adminPasswordHash);

export default config;
