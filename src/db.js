// SQLite connection + schema migration. Exposes a single shared connection and
// a couple of small helpers used across routes. All callers use prepared
// statements (parameterized) — never string-built SQL.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import config from "./config.js";

let db;

export function getDb() {
  if (db) return db;

  // ":memory:" is honored as-is (used by tests); otherwise ensure the dir exists.
  if (config.dbFile !== ":memory:") {
    fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  }
  db = new Database(config.dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      title          TEXT    NOT NULL,
      icon           TEXT    NOT NULL DEFAULT 'trophy',
      required_count INTEGER NOT NULL CHECK (required_count >= 1),
      points_reward  INTEGER NOT NULL CHECK (points_reward >= 0),
      current_count  INTEGER NOT NULL DEFAULT 0 CHECK (current_count >= 0),
      status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL,
      completed_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_marks (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
      mark_date      TEXT    NOT NULL,
      UNIQUE (achievement_id, mark_date)
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      icon        TEXT    NOT NULL DEFAULT 'gem',
      cost        INTEGER NOT NULL CHECK (cost >= 0),
      type        TEXT    NOT NULL DEFAULT 'repeatable' CHECK (type IN ('one_time','repeatable')),
      status      TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','redeemed')),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS redemptions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      reward_id      INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
      title_snapshot TEXT    NOT NULL,
      icon_snapshot  TEXT    NOT NULL,
      cost_snapshot  INTEGER NOT NULL,
      redeemed_at    TEXT    NOT NULL
    );
  `);
}

// Today's date in the server's local timezone as YYYY-MM-DD. The "day boundary"
// for the once-per-day rule is the house's local midnight.
export function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function nowIso() {
  return new Date().toISOString();
}

// Computed gold balance — the single source of truth. Sum of points from
// completed achievements minus the cost of every redemption ever made.
export function getBalance(d = getDb()) {
  const earned =
    d.prepare(
      `SELECT COALESCE(SUM(points_reward), 0) AS v
         FROM achievements WHERE status = 'completed'`
    ).get().v;
  const spent =
    d.prepare(`SELECT COALESCE(SUM(cost_snapshot), 0) AS v FROM redemptions`).get().v;
  return earned - spent;
}
