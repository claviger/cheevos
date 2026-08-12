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

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Incremental, idempotent migrations for already-deployed databases.
  addColumnIfMissing(d, "achievements", "description", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(d, "rewards", "description", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(d, "achievements", "repeatable", "INTEGER NOT NULL DEFAULT 0");
  // Local day (YYYY-MM-DD) the achievement was completed — used to decide when a
  // repeatable achievement becomes available again (the next local day).
  addColumnIfMissing(d, "achievements", "completed_on", "TEXT");

  // Completion history. One row per completion, with snapshots so entries
  // survive later edits. This is the source of truth for earned points and the
  // Hall of Fame (repeatable achievements can appear many times). Backfill from
  // already-completed achievements the first time the table is created.
  const hasCompletions = d
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'completions'`)
    .get();
  if (!hasCompletions) {
    d.exec(`
      CREATE TABLE completions (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        achievement_id       INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
        title_snapshot       TEXT    NOT NULL,
        description_snapshot TEXT    NOT NULL DEFAULT '',
        icon_snapshot        TEXT    NOT NULL,
        points_snapshot      INTEGER NOT NULL,
        completed_at         TEXT    NOT NULL
      );
    `);
    d.exec(`
      INSERT INTO completions
        (achievement_id, title_snapshot, description_snapshot, icon_snapshot, points_snapshot, completed_at)
      SELECT id, title, description, icon, points_reward, COALESCE(completed_at, created_at)
        FROM achievements WHERE status = 'completed';
    `);
  }
}

// Add a column only if it doesn't already exist (SQLite has no ADD COLUMN IF
// NOT EXISTS). Lets existing installs upgrade without losing data.
function addColumnIfMissing(d, table, column, definition) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// --- Settings (key/value) --------------------------------------------------
const SETTING_DEFAULTS = { app_title: "Cheevos" };

export function getSetting(key, d = getDb()) {
  const row = d.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : SETTING_DEFAULTS[key] ?? null;
}

export function setSetting(key, value, d = getDb()) {
  d.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
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

// Computed gold balance — the single source of truth. Sum of points from every
// recorded completion minus the cost of every redemption ever made.
export function getBalance(d = getDb()) {
  const earned =
    d.prepare(`SELECT COALESCE(SUM(points_snapshot), 0) AS v FROM completions`).get().v;
  const spent =
    d.prepare(`SELECT COALESCE(SUM(cost_snapshot), 0) AS v FROM redemptions`).get().v;
  return earned - spent;
}
