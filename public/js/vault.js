// Treasure Vault: lists rewards the child can buy. Redeeming is gated by the
// server (re-checks balance); the client just disables what isn't affordable.
import { api, el, clear, icon, coin, loadIcons, initChrome, refreshBalance, toast } from "./api.js";

const vault = document.getElementById("vault");
const empty = document.getElementById("empty");
let balance = 0;
let busy = false;

function card(r) {
  const affordable = balance >= r.cost;
  const cost = el("div", { class: "reward-chip" }, [coin("sm"), el("span", { text: `${r.cost}` })]);
  const tag = el("div", {
    class: "type-tag " + (r.type === "one_time" ? "one" : "many"),
    text: r.type === "one_time" ? "one-time" : "repeatable",
  });

  return el(
    "button",
    {
      class: "card reward" + (affordable ? "" : " locked"),
      type: "button",
      disabled: affordable ? null : "true",
      title: affordable ? "Tap to redeem" : "Not enough gold yet",
      onClick: () => onRedeem(r),
    },
    [
      el("div", { class: "card-icon" }, [icon(r.icon, "lg")]),
      el("div", { class: "card-title", text: r.title }),
      cost,
      tag,
      affordable ? null : el("div", { class: "stamp lock", text: "🔒 locked" }),
    ]
  );
}

async function onRedeem(r) {
  if (busy) return;
  busy = true;
  try {
    const res = await api(`rewards/${r.id}/redeem`, { method: "POST" });
    balance = await refreshBalance(res.balance);
    toast(`Redeemed “${r.title}”! Tell a parent to claim it.`, "success");
    await load();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    busy = false;
  }
}

async function load() {
  const data = await api("rewards");
  balance = data.balance;
  await refreshBalance(balance);
  clear(vault);
  if (!data.rewards.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  data.rewards.forEach((r) => vault.appendChild(card(r)));
}

(async function init() {
  initChrome("vault");
  await loadIcons();
  try {
    await load();
  } catch (err) {
    toast(err.message, "error");
  }
})();
