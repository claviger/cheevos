// Quest Board: lists active achievements and lets the child mark/un-mark one
// step per day. Completing a quest celebrates and moves it to the Hall of Fame.
import { api, el, clear, icon, coin, loadIcons, initChrome, refreshBalance, toast } from "./api.js";

const board = document.getElementById("board");
const empty = document.getElementById("empty");
let busy = false;

function card(a) {
  const pct = Math.min(100, Math.round((a.current_count / a.required_count) * 100));
  const progress = el("div", { class: "progress" }, [
    el("div", { class: "progress-fill" }),
    el("span", { class: "progress-label", text: `${a.current_count} / ${a.required_count}` }),
  ]);
  // Width set via CSSOM (CSP-safe, no inline style attribute in markup).
  progress.querySelector(".progress-fill").style.width = pct + "%";

  const reward = el("div", { class: "reward-chip" }, [
    coin("sm"),
    el("span", { text: `${a.points_reward}` }),
  ]);

  const badges = el("div", { class: "card-head" }, [
    el("div", { class: "card-title", text: a.title }),
    reward,
  ]);
  if (a.repeatable) {
    badges.insertBefore(
      el("span", { class: "repeat-badge", title: "Comes back every day", text: "↻ daily" }),
      reward
    );
  }

  const body = el("div", { class: "card-body" }, [
    badges,
    a.description ? el("div", { class: "card-desc", text: a.description }) : null,
    progress,
  ]);

  return el(
    "button",
    {
      class: "card quest" + (a.marked_today ? " marked" : ""),
      type: "button",
      title: a.marked_today ? "Tap to undo today's tap" : "Tap to make progress",
      onClick: () => onTap(a),
    },
    [
      el("div", { class: "card-icon" }, [icon(a.icon, "lg")]),
      body,
      a.marked_today ? el("div", { class: "stamp", text: "✓ done today" }) : null,
    ]
  );
}

async function onTap(a) {
  if (busy) return;
  busy = true;
  try {
    const method = a.marked_today ? "DELETE" : "POST";
    const res = await api(`achievements/${a.id}/mark`, { method });
    await refreshBalance(res.balance);
    if (res.achievement.status === "completed") {
      toast(`Quest complete! +${a.points_reward} gold 🏆`, "success");
    }
    await load();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    busy = false;
  }
}

async function load() {
  const { achievements, balance } = await api("achievements");
  await refreshBalance(balance);
  clear(board);
  if (!achievements.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  achievements.forEach((a) => board.appendChild(card(a)));
}

(async function init() {
  await initChrome("board");
  await loadIcons();
  try {
    await load();
  } catch (err) {
    toast(err.message, "error");
  }
})();
