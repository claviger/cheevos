// Core business rules, kept independent of HTTP so they can be unit-tested
// directly against an in-memory database. Every function takes an explicit `d`
// (database handle) plus a `today` string where the day boundary matters, so
// tests can simulate different days deterministically.
import { localDate, nowIso, getBalance } from "./db.js";

export class RuleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function getAchievement(d, id) {
  return d.prepare(`SELECT * FROM achievements WHERE id = ?`).get(id);
}

// Whether this achievement already has a mark for the given day.
export function isMarkedOn(d, id, day) {
  return Boolean(
    d.prepare(`SELECT 1 FROM daily_marks WHERE achievement_id = ? AND mark_date = ?`).get(id, day)
  );
}

// Record a completion in the history (snapshots the achievement so the entry
// survives later edits). Earned points and the Hall of Fame read from here.
function recordCompletion(d, a, when = nowIso()) {
  d.prepare(
    `INSERT INTO completions
       (achievement_id, title_snapshot, description_snapshot, icon_snapshot, points_snapshot, completed_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(a.id, a.title, a.description, a.icon, a.points_reward, when);
}

// Revoke the most recent completion for an achievement (used when a completion
// is undone via unmark or an admin edit).
function deleteLatestCompletion(d, achievementId) {
  d.prepare(
    `DELETE FROM completions WHERE id =
       (SELECT id FROM completions WHERE achievement_id = ? ORDER BY id DESC LIMIT 1)`
  ).run(achievementId);
}

// Repeatable achievements come back the next local day after completing: reset
// any whose completion day is before `today`. The completion stays recorded in
// the completions history (points + Hall of Fame entry are kept).
export function resetDueRepeatables(d, today = localDate()) {
  d.prepare(
    `UPDATE achievements
        SET status = 'active', current_count = 0, completed_at = NULL, completed_on = NULL
      WHERE repeatable = 1 AND status = 'completed'
        AND (completed_on IS NULL OR completed_on < ?)`
  ).run(today);
}

// Annotate an active achievement row with whether it was marked today.
export function decorateActive(d, row, today = localDate()) {
  return { ...row, marked_today: isMarkedOn(d, row.id, today) };
}

export function listActive(d, today = localDate()) {
  resetDueRepeatables(d, today);
  const rows = d
    .prepare(`SELECT * FROM achievements WHERE status = 'active' ORDER BY sort_order, id`)
    .all();
  return rows.map((r) => decorateActive(d, r, today));
}

// All achievements regardless of status — for the parent console.
export function listAllAchievements(d, today = localDate()) {
  resetDueRepeatables(d, today);
  return d.prepare(`SELECT * FROM achievements ORDER BY status, sort_order, id`).all();
}

// Hall of Fame: every recorded completion, newest first. Aliased to the same
// field names the achievement cards use.
export function listCompleted(d) {
  return d
    .prepare(
      `SELECT id, achievement_id,
              title_snapshot       AS title,
              description_snapshot AS description,
              icon_snapshot        AS icon,
              points_snapshot      AS points_reward,
              completed_at
         FROM completions
        ORDER BY completed_at DESC, id DESC`
    )
    .all();
}

// Advance an achievement by one step for `today`. Enforces once-per-achievement
// -per-day via the daily_marks UNIQUE constraint. Completes (and awards points)
// when the required count is reached. Idempotent guard: returns the row if it is
// already marked today rather than double-counting.
export function markAchievement(d, id, today = localDate()) {
  const tx = d.transaction(() => {
    resetDueRepeatables(d, today);
    const a = getAchievement(d, id);
    if (!a) throw new RuleError("Achievement not found.", 404);
    if (a.status !== "active") throw new RuleError("This achievement is already completed.", 409);
    if (isMarkedOn(d, id, today)) return getAchievement(d, id); // already done today

    d.prepare(`INSERT INTO daily_marks (achievement_id, mark_date) VALUES (?, ?)`).run(id, today);
    const newCount = a.current_count + 1;
    if (newCount >= a.required_count) {
      d.prepare(
        `UPDATE achievements
            SET current_count = ?, status = 'completed', completed_at = ?, completed_on = ?
          WHERE id = ?`
      ).run(newCount, nowIso(), today, id);
      recordCompletion(d, a);
    } else {
      d.prepare(`UPDATE achievements SET current_count = ? WHERE id = ?`).run(newCount, id);
    }
    return getAchievement(d, id);
  });
  return tx();
}

// Undo today's mark (misclick fix). Only today's mark is reversible. If marking
// today had completed the achievement, reverting the mark reopens it.
export function unmarkAchievement(d, id, today = localDate()) {
  const tx = d.transaction(() => {
    const a = getAchievement(d, id);
    if (!a) throw new RuleError("Achievement not found.", 404);
    if (!isMarkedOn(d, id, today)) {
      throw new RuleError("There is no mark from today to undo.", 409);
    }
    d.prepare(`DELETE FROM daily_marks WHERE achievement_id = ? AND mark_date = ?`).run(id, today);
    const newCount = Math.max(0, a.current_count - 1);
    // Reopen if it had just completed (count now below requirement).
    const status = newCount >= a.required_count ? "completed" : "active";
    const completedAt = status === "completed" ? a.completed_at : null;
    const completedOn = status === "completed" ? a.completed_on : null;
    if (a.status === "completed" && status === "active") deleteLatestCompletion(d, id);
    d.prepare(
      `UPDATE achievements SET current_count = ?, status = ?, completed_at = ?, completed_on = ? WHERE id = ?`
    ).run(newCount, status, completedAt, completedOn, id);
    return getAchievement(d, id);
  });
  return tx();
}

// --- Admin achievement operations -----------------------------------------

export function createAchievement(d, { title, description = "", icon, required_count, points_reward, repeatable = 0 }) {
  const order =
    d.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS v FROM achievements`).get().v;
  const info = d
    .prepare(
      `INSERT INTO achievements
         (title, description, icon, required_count, points_reward, repeatable, current_count, status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`
    )
    .run(title, description, icon, required_count, points_reward, repeatable ? 1 : 0, order, nowIso());
  return getAchievement(d, info.lastInsertRowid);
}

// Edit an achievement, including setting current_count directly. Recomputes
// status: count >= required auto-completes (awarding points); reducing below
// required reopens it.
export function updateAchievement(d, id, fields) {
  const tx = d.transaction(() => {
    const a = getAchievement(d, id);
    if (!a) throw new RuleError("Achievement not found.", 404);

    const title = fields.title ?? a.title;
    const description = fields.description ?? a.description;
    const icon = fields.icon ?? a.icon;
    const required_count = fields.required_count ?? a.required_count;
    const points_reward = fields.points_reward ?? a.points_reward;
    const current_count = fields.current_count ?? a.current_count;
    const repeatable = fields.repeatable !== undefined ? (fields.repeatable ? 1 : 0) : a.repeatable;

    let status = a.status;
    let completed_at = a.completed_at;
    let completed_on = a.completed_on;
    if (current_count >= required_count) {
      status = "completed";
      if (a.status !== "completed") {
        completed_at = nowIso();
        completed_on = localDate();
        recordCompletion(d, { ...a, title, description, icon, points_reward }, completed_at);
      }
    } else {
      status = "active";
      completed_at = null;
      completed_on = null;
      if (a.status === "completed") deleteLatestCompletion(d, id);
    }

    d.prepare(
      `UPDATE achievements
          SET title = ?, description = ?, icon = ?, required_count = ?, points_reward = ?,
              repeatable = ?, current_count = ?, status = ?, completed_at = ?, completed_on = ?
        WHERE id = ?`
    ).run(title, description, icon, required_count, points_reward, repeatable, current_count, status, completed_at, completed_on, id);
    return getAchievement(d, id);
  });
  return tx();
}

export function deleteAchievement(d, id) {
  const info = d.prepare(`DELETE FROM achievements WHERE id = ?`).run(id);
  if (info.changes === 0) throw new RuleError("Achievement not found.", 404);
}

// --- Rewards ---------------------------------------------------------------

export function listRewards(d) {
  return d
    .prepare(`SELECT * FROM rewards WHERE status = 'active' ORDER BY sort_order, id`)
    .all();
}

export function listAllRewards(d) {
  return d.prepare(`SELECT * FROM rewards ORDER BY sort_order, id`).all();
}

export function getReward(d, id) {
  return d.prepare(`SELECT * FROM rewards WHERE id = ?`).get(id);
}

export function createReward(d, { title, description = "", icon, cost, type }) {
  const order = d.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS v FROM rewards`).get().v;
  const info = d
    .prepare(
      `INSERT INTO rewards (title, description, icon, cost, type, status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    )
    .run(title, description, icon, cost, type, order, nowIso());
  return getReward(d, info.lastInsertRowid);
}

export function updateReward(d, id, fields) {
  const r = getReward(d, id);
  if (!r) throw new RuleError("Reward not found.", 404);
  const title = fields.title ?? r.title;
  const description = fields.description ?? r.description;
  const icon = fields.icon ?? r.icon;
  const cost = fields.cost ?? r.cost;
  const type = fields.type ?? r.type;
  const status = fields.status ?? r.status;
  d.prepare(
    `UPDATE rewards SET title = ?, description = ?, icon = ?, cost = ?, type = ?, status = ? WHERE id = ?`
  ).run(title, description, icon, cost, type, status, id);
  return getReward(d, id);
}

export function deleteReward(d, id) {
  const info = d.prepare(`DELETE FROM rewards WHERE id = ?`).run(id);
  if (info.changes === 0) throw new RuleError("Reward not found.", 404);
}

// Redeem a reward. Re-checks affordability INSIDE the transaction against the
// computed balance — the client value is never trusted. One-time rewards are
// retired (status='redeemed'); repeatable rewards stay available. A snapshot of
// the reward is written to history so it survives later edits/deletes.
export function redeemReward(d, id) {
  const tx = d.transaction(() => {
    const r = getReward(d, id);
    if (!r) throw new RuleError("Reward not found.", 404);
    if (r.status !== "active") throw new RuleError("This reward is no longer available.", 409);

    const balance = getBalance(d);
    if (balance < r.cost) {
      throw new RuleError("Not enough gold to redeem this reward.", 409);
    }

    d.prepare(
      `INSERT INTO redemptions (reward_id, title_snapshot, icon_snapshot, cost_snapshot, redeemed_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(r.id, r.title, r.icon, r.cost, nowIso());

    if (r.type === "one_time") {
      d.prepare(`UPDATE rewards SET status = 'redeemed' WHERE id = ?`).run(id);
    }
    return { reward: getReward(d, id), balance: getBalance(d) };
  });
  return tx();
}

export function listRedemptions(d) {
  return d.prepare(`SELECT * FROM redemptions ORDER BY redeemed_at DESC, id DESC`).all();
}
