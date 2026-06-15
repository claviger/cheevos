// Admin authentication endpoints: login / logout / session status. The parent
// password is verified against the scrypt hash in config; success flips the
// session to admin and (re)issues a CSRF token.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import config from "../config.js";
import { verifyPassword, getCsrfToken } from "../auth.js";
import { handle } from "./helpers.js";

export const adminAuth = Router();

// Limit password guessing: 10 attempts / 15 min per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

adminAuth.get(
  "/session",
  handle((req, res) => {
    const isAdmin = Boolean(req.session && req.session.isAdmin);
    res.json({
      isAdmin,
      adminConfigured: config.adminConfigured,
      csrfToken: isAdmin ? getCsrfToken(req) : null,
    });
  })
);

adminAuth.post(
  "/login",
  loginLimiter,
  handle((req, res) => {
    if (!config.adminConfigured) {
      return res.status(503).json({
        error: "Admin password not set. Run: npm run set-password",
      });
    }
    const password = req.body && req.body.password;
    if (!verifyPassword(password, config.adminPasswordHash)) {
      return res.status(401).json({ error: "Incorrect password." });
    }
    // Prevent session fixation: regenerate before elevating privileges.
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Login failed." });
      req.session.isAdmin = true;
      res.json({ ok: true, csrfToken: getCsrfToken(req) });
    });
  })
);

adminAuth.post(
  "/logout",
  handle((req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  })
);
