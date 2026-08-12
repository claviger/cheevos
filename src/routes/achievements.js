// Achievement endpoints. Public reads + child mark/unmark; admin create/update/
// delete (mounted with requireAdmin + requireCsrf by the parent router).
import { Router } from "express";
import { getDb, localDate, getBalance } from "../db.js";
import * as logic from "../logic.js";
import { str, optStr, int } from "../validate.js";
import { handle, idParam } from "./helpers.js";

// --- Public / child router -------------------------------------------------
export const publicAchievements = Router();

publicAchievements.get(
  "/achievements",
  handle((req, res) => {
    const d = getDb();
    res.json({ achievements: logic.listActive(d, localDate()), balance: getBalance(d) });
  })
);

publicAchievements.get(
  "/hall",
  handle((req, res) => {
    const d = getDb();
    res.json({ achievements: logic.listCompleted(d), balance: getBalance(d) });
  })
);

publicAchievements.post(
  "/achievements/:id/mark",
  handle((req, res) => {
    const d = getDb();
    const row = logic.markAchievement(d, idParam(req), localDate());
    res.json({ achievement: logic.decorateActive(d, row), balance: getBalance(d) });
  })
);

publicAchievements.delete(
  "/achievements/:id/mark",
  handle((req, res) => {
    const d = getDb();
    const row = logic.unmarkAchievement(d, idParam(req), localDate());
    res.json({ achievement: logic.decorateActive(d, row), balance: getBalance(d) });
  })
);

// --- Admin router ----------------------------------------------------------
export const adminAchievements = Router();

adminAchievements.get(
  "/achievements",
  handle((req, res) => {
    res.json({ achievements: logic.listAllAchievements(getDb()) });
  })
);

adminAchievements.post(
  "/achievements",
  handle((req, res) => {
    const d = getDb();
    const data = {
      title: str(req.body.title, "Title"),
      description: optStr(req.body.description, "Description"),
      icon: str(req.body.icon, "Icon", { max: 80 }),
      required_count: int(req.body.required_count, "Times required", { min: 1 }),
      points_reward: int(req.body.points_reward, "Points", { min: 0 }),
      repeatable: req.body.repeatable ? 1 : 0,
    };
    res.status(201).json({ achievement: logic.createAchievement(d, data) });
  })
);

adminAchievements.put(
  "/achievements/:id",
  handle((req, res) => {
    const d = getDb();
    const fields = {};
    if (req.body.title !== undefined) fields.title = str(req.body.title, "Title");
    if (req.body.description !== undefined)
      fields.description = optStr(req.body.description, "Description");
    if (req.body.icon !== undefined) fields.icon = str(req.body.icon, "Icon", { max: 80 });
    if (req.body.required_count !== undefined)
      fields.required_count = int(req.body.required_count, "Times required", { min: 1 });
    if (req.body.points_reward !== undefined)
      fields.points_reward = int(req.body.points_reward, "Points", { min: 0 });
    if (req.body.current_count !== undefined)
      fields.current_count = int(req.body.current_count, "Current count", { min: 0 });
    if (req.body.repeatable !== undefined) fields.repeatable = req.body.repeatable ? 1 : 0;
    res.json({ achievement: logic.updateAchievement(d, idParam(req), fields) });
  })
);

adminAchievements.delete(
  "/achievements/:id",
  handle((req, res) => {
    logic.deleteAchievement(getDb(), idParam(req));
    res.json({ ok: true });
  })
);
