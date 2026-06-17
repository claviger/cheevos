// Cheevos server entry point. A single Express process serves the themed static
// frontend and a JSON API, both mounted under a configurable base path
// (default /cheevos) so it works behind nginx and standalone. Storage is SQLite.
import path from "node:path";
import express from "express";
import helmet from "helmet";
import config from "./src/config.js";
import { getDb, getBalance } from "./src/db.js";
import { sessionMiddleware, requireAdmin, requireCsrf } from "./src/auth.js";
import { publicAchievements, adminAchievements } from "./src/routes/achievements.js";
import { publicRewards, adminRewards } from "./src/routes/rewards.js";
import { adminAuth } from "./src/routes/admin.js";
import { publicIcons } from "./src/routes/icons.js";
import { publicSettings, adminSettings } from "./src/routes/settings.js";

const app = express();
app.set("trust proxy", "loopback"); // behind nginx on localhost
app.disable("x-powered-by");

// Security headers. CSP is self-only; the frontend uses external JS/CSS files
// and sets any dynamic styles via the CSSOM (allowed without 'unsafe-inline').
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'self'"],
        "upgrade-insecure-requests": null, // plain HTTP on the LAN
      },
    },
    // The reverse proxy terminates connections on the LAN over HTTP.
    hsts: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  })
);

// Initialize DB (runs migrations) up front so failures surface at boot.
getDb();

// --- API router ------------------------------------------------------------
const api = express.Router();
api.use(express.json({ limit: "64kb" }));
api.use(sessionMiddleware());

// Public / child endpoints
api.use(publicAchievements);
api.use(publicRewards);
api.use(publicIcons);
api.use(publicSettings);
api.get("/balance", (req, res) => res.json({ balance: getBalance(getDb()) }));

// Admin auth (login/logout/session) — no admin gate.
api.use("/admin", adminAuth);

// Admin data endpoints — gated by session + CSRF, namespaced under /admin.
const adminApi = express.Router();
adminApi.use(requireAdmin, requireCsrf);
adminApi.use(adminAchievements);
adminApi.use(adminRewards);
adminApi.use(adminSettings);
api.use("/admin", adminApi);

// JSON 404 for unknown API routes.
api.use((req, res) => res.status(404).json({ error: "Not found." }));

// --- App router (static + API), mounted under the base path ----------------
const appRouter = express.Router();
appRouter.use("/api", api);
appRouter.use(
  express.static(path.join(config.root, "public"), {
    extensions: ["html"],
    index: "index.html",
  })
);

const mount = config.basePath || "/";
app.use(mount, appRouter);

// If running under a base path, redirect the bare root and the slash-less base
// path to "<base>/" so relative asset/API paths in the HTML resolve correctly.
if (config.basePath) {
  app.get("/", (req, res) => res.redirect(config.basePath + "/"));
  app.get(config.basePath, (req, res) => res.redirect(config.basePath + "/"));
}

const server = app.listen(config.port, config.host, () => {
  const where = `http://${config.host}:${config.port}${config.basePath}/`;
  console.log(`cheevos listening at ${where}`);
  if (!config.adminConfigured) {
    console.warn("⚠  Admin password not set. Run:  npm run set-password");
  }
  if (config.usingExampleSecret) {
    console.warn(
      "⚠  Using a generated/example session secret. Set 'sessionSecret' in config/config.json to keep sessions across restarts."
    );
  }
});

export { app, server };
