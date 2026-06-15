// Lists the bundled icon set (filenames, without extension) so the admin icon
// picker and the cards can reference them. Reads the public/icons directory at
// request time — cheap at this scale and avoids a restart when icons change.
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import config from "../config.js";
import { handle } from "./helpers.js";

export const publicIcons = Router();

const iconsDir = path.join(config.root, "public", "icons");

publicIcons.get(
  "/icons",
  handle((req, res) => {
    let names = [];
    try {
      names = fs
        .readdirSync(iconsDir)
        .filter((f) => f.toLowerCase().endsWith(".svg"))
        .map((f) => f.replace(/\.svg$/i, ""))
        .sort();
    } catch {
      names = [];
    }
    res.json({ icons: names });
  })
);
