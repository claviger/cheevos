// Hall of Fame: a read-only trophy gallery of completed achievements.
import { api, el, clear, icon, coin, loadIcons, initChrome, refreshBalance, toast } from "./api.js";

const hall = document.getElementById("hall");
const empty = document.getElementById("empty");

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function trophy(a) {
  const body = el("div", { class: "card-body" }, [
    el("div", { class: "card-head" }, [
      el("div", { class: "card-title", text: a.title }),
      el("div", { class: "reward-chip" }, [coin("sm"), el("span", { text: `${a.points_reward}` })]),
    ]),
    a.description ? el("div", { class: "card-desc", text: a.description }) : null,
    el("div", { class: "earned", text: `Earned ${fmtDate(a.completed_at)}` }),
  ]);
  return el("div", { class: "card trophy" }, [
    el("div", { class: "card-icon" }, [icon(a.icon, "lg")]),
    body,
  ]);
}

async function load() {
  const { achievements, balance } = await api("hall");
  await refreshBalance(balance);
  clear(hall);
  if (!achievements.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  achievements.forEach((a) => hall.appendChild(trophy(a)));
}

(async function init() {
  await initChrome("hall");
  await loadIcons();
  try {
    await load();
  } catch (err) {
    toast(err.message, "error");
  }
})();
