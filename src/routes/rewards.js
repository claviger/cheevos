// Reward endpoints. Public reads + child redeem; admin create/update/delete and
// redemption history (mounted with requireAdmin + requireCsrf by the parent).
import { Router } from "express";
import { getDb, getBalance } from "../db.js";
import * as logic from "../logic.js";
import { str, int, oneOf } from "../validate.js";
import { handle, idParam } from "./helpers.js";

// --- Public / child router -------------------------------------------------
export const publicRewards = Router();

publicRewards.get(
  "/rewards",
  handle((req, res) => {
    const d = getDb();
    res.json({ rewards: logic.listRewards(d), balance: getBalance(d) });
  })
);

publicRewards.post(
  "/rewards/:id/redeem",
  handle((req, res) => {
    const d = getDb();
    const result = logic.redeemReward(d, idParam(req));
    res.json({ reward: result.reward, balance: result.balance });
  })
);

// --- Admin router ----------------------------------------------------------
export const adminRewards = Router();

adminRewards.get(
  "/rewards",
  handle((req, res) => {
    res.json({ rewards: logic.listAllRewards(getDb()) });
  })
);

adminRewards.post(
  "/rewards",
  handle((req, res) => {
    const d = getDb();
    const data = {
      title: str(req.body.title, "Title"),
      icon: str(req.body.icon, "Icon", { max: 80 }),
      cost: int(req.body.cost, "Cost", { min: 0 }),
      type: oneOf(req.body.type, "Type", ["one_time", "repeatable"]),
    };
    res.status(201).json({ reward: logic.createReward(d, data) });
  })
);

adminRewards.put(
  "/rewards/:id",
  handle((req, res) => {
    const d = getDb();
    const fields = {};
    if (req.body.title !== undefined) fields.title = str(req.body.title, "Title");
    if (req.body.icon !== undefined) fields.icon = str(req.body.icon, "Icon", { max: 80 });
    if (req.body.cost !== undefined) fields.cost = int(req.body.cost, "Cost", { min: 0 });
    if (req.body.type !== undefined)
      fields.type = oneOf(req.body.type, "Type", ["one_time", "repeatable"]);
    if (req.body.status !== undefined)
      fields.status = oneOf(req.body.status, "Status", ["active", "redeemed"]);
    res.json({ reward: logic.updateReward(d, idParam(req), fields) });
  })
);

adminRewards.delete(
  "/rewards/:id",
  handle((req, res) => {
    logic.deleteReward(getDb(), idParam(req));
    res.json({ ok: true });
  })
);

adminRewards.get(
  "/redemptions",
  handle((req, res) => {
    res.json({ redemptions: logic.listRedemptions(getDb()) });
  })
);
