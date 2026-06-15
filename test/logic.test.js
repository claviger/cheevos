// Business-rule tests for the core logic, run against an in-memory SQLite DB.
// These cover the rules that are easy to get subtly wrong: once-per-day marking,
// un-marking, auto-completion + point award, balance computation, and the
// server-side redemption gate.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Force an in-memory DB BEFORE importing modules that read config.
process.env.DB_FILE = ":memory:";

const { getDb, getBalance } = await import("../src/db.js");
const logic = await import("../src/logic.js");

const d = getDb();

beforeEach(() => {
  d.exec("DELETE FROM daily_marks; DELETE FROM redemptions; DELETE FROM rewards; DELETE FROM achievements;");
});

function newAchievement(over = {}) {
  return logic.createAchievement(d, {
    title: "Brush teeth",
    icon: "tooth",
    required_count: 3,
    points_reward: 10,
    ...over,
  });
}

test("marking advances count by one and is recorded for the day", () => {
  const a = newAchievement();
  const r = logic.markAchievement(d, a.id, "2026-06-14");
  assert.equal(r.current_count, 1);
  assert.equal(r.status, "active");
  assert.equal(logic.isMarkedOn(d, a.id, "2026-06-14"), true);
});

test("only one mark per achievement per day (second same-day mark is a no-op)", () => {
  const a = newAchievement();
  logic.markAchievement(d, a.id, "2026-06-14");
  const again = logic.markAchievement(d, a.id, "2026-06-14");
  assert.equal(again.current_count, 1, "same-day re-mark must not increment");
});

test("different days each add one step", () => {
  const a = newAchievement({ required_count: 5 });
  logic.markAchievement(d, a.id, "2026-06-14");
  logic.markAchievement(d, a.id, "2026-06-15");
  const r = logic.getAchievement(d, a.id);
  assert.equal(r.current_count, 2);
});

test("un-mark removes today's step (misclick fix)", () => {
  const a = newAchievement();
  logic.markAchievement(d, a.id, "2026-06-14");
  const r = logic.unmarkAchievement(d, a.id, "2026-06-14");
  assert.equal(r.current_count, 0);
  assert.equal(logic.isMarkedOn(d, a.id, "2026-06-14"), false);
});

test("un-mark with no mark today throws", () => {
  const a = newAchievement();
  assert.throws(() => logic.unmarkAchievement(d, a.id, "2026-06-14"), /no mark from today/i);
});

test("reaching required count completes and awards points to the balance", () => {
  const a = newAchievement({ required_count: 2, points_reward: 25 });
  logic.markAchievement(d, a.id, "2026-06-14");
  assert.equal(getBalance(d), 0, "no points before completion");
  const done = logic.markAchievement(d, a.id, "2026-06-15");
  assert.equal(done.status, "completed");
  assert.equal(getBalance(d), 25);
});

test("un-marking a same-day completion reopens it and revokes the points", () => {
  const a = newAchievement({ required_count: 1, points_reward: 30 });
  const done = logic.markAchievement(d, a.id, "2026-06-14");
  assert.equal(done.status, "completed");
  assert.equal(getBalance(d), 30);
  const reopened = logic.unmarkAchievement(d, a.id, "2026-06-14");
  assert.equal(reopened.status, "active");
  assert.equal(getBalance(d), 0);
});

test("admin editing current_count past required auto-completes and awards", () => {
  const a = newAchievement({ required_count: 4, points_reward: 40 });
  const r = logic.updateAchievement(d, a.id, { current_count: 4 });
  assert.equal(r.status, "completed");
  assert.equal(getBalance(d), 40);
});

test("admin reducing current_count below required reopens it", () => {
  const a = newAchievement({ required_count: 2, points_reward: 40 });
  logic.updateAchievement(d, a.id, { current_count: 2 });
  const r = logic.updateAchievement(d, a.id, { current_count: 1 });
  assert.equal(r.status, "active");
  assert.equal(getBalance(d), 0);
});

test("redeem requires enough gold (server-side gate)", () => {
  const reward = logic.createReward(d, { title: "Ice cream", icon: "ice-cream", cost: 50, type: "repeatable" });
  assert.throws(() => logic.redeemReward(d, reward.id), /not enough gold/i);
});

test("redeem deducts gold and records history with snapshots", () => {
  const a = newAchievement({ required_count: 1, points_reward: 100 });
  logic.markAchievement(d, a.id, "2026-06-14");
  const reward = logic.createReward(d, { title: "Ice cream", icon: "ice-cream", cost: 30, type: "repeatable" });
  const res = logic.redeemReward(d, reward.id);
  assert.equal(res.balance, 70);
  const history = logic.listRedemptions(d);
  assert.equal(history.length, 1);
  assert.equal(history[0].title_snapshot, "Ice cream");
  assert.equal(history[0].cost_snapshot, 30);
});

test("one-time reward is retired after redemption; repeatable stays", () => {
  const a = newAchievement({ required_count: 1, points_reward: 100 });
  logic.markAchievement(d, a.id, "2026-06-14");
  const once = logic.createReward(d, { title: "Toy", icon: "gem", cost: 10, type: "one_time" });
  const many = logic.createReward(d, { title: "Candy", icon: "cupcake", cost: 10, type: "repeatable" });
  logic.redeemReward(d, once.id);
  logic.redeemReward(d, many.id);
  const active = logic.listRewards(d).map((r) => r.title);
  assert.deepEqual(active, ["Candy"], "one-time reward should drop off the active list");
});

test("history snapshot survives deleting the reward", () => {
  const a = newAchievement({ required_count: 1, points_reward: 100 });
  logic.markAchievement(d, a.id, "2026-06-14");
  const reward = logic.createReward(d, { title: "Movie night", icon: "movie", cost: 20, type: "repeatable" });
  logic.redeemReward(d, reward.id);
  logic.deleteReward(d, reward.id);
  const history = logic.listRedemptions(d);
  assert.equal(history[0].title_snapshot, "Movie night");
  assert.equal(history[0].reward_id, null, "FK nulled but snapshot retained");
});
