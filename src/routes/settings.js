// App settings: currently just the editable header caption (app_title). Public
// reads the title (every page shows it); admin updates it.
import { Router } from "express";
import { getSetting, setSetting } from "../db.js";
import { str } from "../validate.js";
import { handle } from "./helpers.js";

export const publicSettings = Router();

publicSettings.get(
  "/settings",
  handle((req, res) => {
    res.json({ title: getSetting("app_title") });
  })
);

export const adminSettings = Router();

adminSettings.put(
  "/settings",
  handle((req, res) => {
    const title = str(req.body.title, "Caption", { max: 60 });
    setSetting("app_title", title);
    res.json({ title });
  })
);
