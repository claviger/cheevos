// Parent console: password login, then CRUD for achievements & rewards, plus the
// redemption history. All mutations carry the CSRF token (handled in api.js).
import { api, el, clear, icon, coin, loadIcons, setCsrf, toast } from "./api.js";

const $ = (id) => document.getElementById(id);

// --- Auth flow -------------------------------------------------------------
async function boot() {
  const sess = await api("admin/session");
  if (sess.isAdmin) {
    setCsrf(sess.csrfToken);
    showConsole();
  } else {
    $("login-hint").textContent = sess.adminConfigured
      ? "Enter the parent password to manage quests and rewards."
      : "No password is set yet. Run `npm run set-password` on the server.";
    $("login").classList.remove("hidden");
  }
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").classList.add("hidden");
  try {
    const res = await api("admin/login", { method: "POST", body: { password: $("password").value } });
    setCsrf(res.csrfToken);
    $("password").value = "";
    showConsole();
  } catch (err) {
    $("login-error").textContent = err.message;
    $("login-error").classList.remove("hidden");
  }
});

$("logout").addEventListener("click", async () => {
  try {
    await api("admin/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  location.reload();
});

async function showConsole() {
  $("login").classList.add("hidden");
  $("console").classList.remove("hidden");
  $("logout").classList.remove("hidden");
  await loadIcons();
  initIconButtons();
  await Promise.all([loadAchievements(), loadRewards(), loadHistory()]);
}

// --- Tabs ------------------------------------------------------------------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    const name = btn.dataset.tab;
    ["achievements", "rewards", "history"].forEach((t) => {
      $("tab-" + t).classList.toggle("hidden", t !== name);
    });
  });
});

// --- Icon picker -----------------------------------------------------------
function initIconButtons() {
  $("ach-icon-btn").addEventListener("click", () => openPicker("ach-icon", "ach-icon-btn"));
  $("rew-icon-btn").addEventListener("click", () => openPicker("rew-icon", "rew-icon-btn"));
  $("icon-close").addEventListener("click", closePicker);
  $("icon-modal").addEventListener("click", (e) => {
    if (e.target === $("icon-modal")) closePicker();
  });
  setIconButton("ach-icon-btn", $("ach-icon").value);
  setIconButton("rew-icon-btn", $("rew-icon").value);
}

function setIconButton(btnId, name) {
  const btn = $(btnId);
  clear(btn);
  btn.appendChild(icon(name, "lg"));
}

async function openPicker(hiddenId, btnId) {
  const set = await loadIcons();
  const grid = clear($("icon-grid"));
  [...set].sort().forEach((name) => {
    const cell = el("button", { type: "button", class: "icon-cell", title: name, onClick: () => {
      $(hiddenId).value = name;
      setIconButton(btnId, name);
      closePicker();
    } }, [icon(name, "lg")]);
    grid.appendChild(cell);
  });
  $("icon-modal").classList.remove("hidden");
}

function closePicker() {
  $("icon-modal").classList.add("hidden");
}

// --- Achievements ----------------------------------------------------------
const achForm = $("ach-form");

function resetAchForm() {
  achForm.reset();
  $("ach-id").value = "";
  $("ach-icon").value = "trophy";
  setIconButton("ach-icon-btn", "trophy");
  $("ach-form-title").textContent = "Add Achievement";
  $("ach-current-wrap").classList.add("hidden");
  $("ach-cancel").classList.add("hidden");
}

$("ach-cancel").addEventListener("click", resetAchForm);

achForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("ach-id").value;
  const body = {
    title: $("ach-title").value,
    icon: $("ach-icon").value,
    required_count: Number($("ach-required").value),
    points_reward: Number($("ach-points").value),
  };
  if (id) body.current_count = Number($("ach-current").value);
  try {
    if (id) await api(`admin/achievements/${id}`, { method: "PUT", body });
    else await api("admin/achievements", { method: "POST", body });
    toast(id ? "Achievement updated." : "Achievement added.", "success");
    resetAchForm();
    await loadAchievements();
  } catch (err) {
    toast(err.message, "error");
  }
});

function editAchievement(a) {
  $("ach-id").value = a.id;
  $("ach-title").value = a.title;
  $("ach-required").value = a.required_count;
  $("ach-points").value = a.points_reward;
  $("ach-current").value = a.current_count;
  $("ach-icon").value = a.icon;
  setIconButton("ach-icon-btn", a.icon);
  $("ach-form-title").textContent = `Edit: ${a.title}`;
  $("ach-current-wrap").classList.remove("hidden");
  $("ach-cancel").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteAchievement(a) {
  if (!confirm(`Delete achievement “${a.title}”? This cannot be undone.`)) return;
  try {
    await api(`admin/achievements/${a.id}`, { method: "DELETE" });
    toast("Achievement deleted.");
    await loadAchievements();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function loadAchievements() {
  const { achievements } = await api("admin/achievements");
  const list = clear($("ach-list"));
  if (!achievements.length) {
    list.appendChild(el("p", { class: "muted", text: "No achievements yet." }));
    return;
  }
  achievements.forEach((a) => {
    const meta = `${a.current_count}/${a.required_count} · ${a.points_reward}g · ${a.status}`;
    list.appendChild(
      el("div", { class: "row" }, [
        el("div", { class: "row-icon" }, [icon(a.icon)]),
        el("div", { class: "row-main" }, [
          el("div", { class: "row-title", text: a.title }),
          el("div", { class: "row-meta", text: meta }),
        ]),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn small", type: "button", text: "Edit", onClick: () => editAchievement(a) }),
          el("button", { class: "btn small danger", type: "button", text: "Delete", onClick: () => deleteAchievement(a) }),
        ]),
      ])
    );
  });
}

// --- Rewards ---------------------------------------------------------------
const rewForm = $("rew-form");

function resetRewForm() {
  rewForm.reset();
  $("rew-id").value = "";
  $("rew-icon").value = "gem";
  setIconButton("rew-icon-btn", "gem");
  $("rew-form-title").textContent = "Add Reward";
  $("rew-cancel").classList.add("hidden");
}

$("rew-cancel").addEventListener("click", resetRewForm);

rewForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("rew-id").value;
  const body = {
    title: $("rew-title").value,
    icon: $("rew-icon").value,
    cost: Number($("rew-cost").value),
    type: $("rew-type").value,
  };
  try {
    if (id) await api(`admin/rewards/${id}`, { method: "PUT", body });
    else await api("admin/rewards", { method: "POST", body });
    toast(id ? "Reward updated." : "Reward added.", "success");
    resetRewForm();
    await loadRewards();
  } catch (err) {
    toast(err.message, "error");
  }
});

function editReward(r) {
  $("rew-id").value = r.id;
  $("rew-title").value = r.title;
  $("rew-cost").value = r.cost;
  $("rew-type").value = r.type;
  $("rew-icon").value = r.icon;
  setIconButton("rew-icon-btn", r.icon);
  $("rew-form-title").textContent = `Edit: ${r.title}`;
  $("rew-cancel").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteReward(r) {
  if (!confirm(`Delete reward “${r.title}”? History is kept.`)) return;
  try {
    await api(`admin/rewards/${r.id}`, { method: "DELETE" });
    toast("Reward deleted.");
    await loadRewards();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function reactivateReward(r) {
  try {
    await api(`admin/rewards/${r.id}`, { method: "PUT", body: { status: "active" } });
    toast("Reward made available again.", "success");
    await loadRewards();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function loadRewards() {
  const { rewards } = await api("admin/rewards");
  const list = clear($("rew-list"));
  if (!rewards.length) {
    list.appendChild(el("p", { class: "muted", text: "No rewards yet." }));
    return;
  }
  rewards.forEach((r) => {
    const meta = `${r.cost}g · ${r.type === "one_time" ? "one-time" : "repeatable"} · ${r.status}`;
    const actions = [
      el("button", { class: "btn small", type: "button", text: "Edit", onClick: () => editReward(r) }),
      el("button", { class: "btn small danger", type: "button", text: "Delete", onClick: () => deleteReward(r) }),
    ];
    if (r.status === "redeemed") {
      actions.unshift(
        el("button", { class: "btn small", type: "button", text: "Re-list", onClick: () => reactivateReward(r) })
      );
    }
    list.appendChild(
      el("div", { class: "row" + (r.status === "redeemed" ? " dim" : "") }, [
        el("div", { class: "row-icon" }, [icon(r.icon)]),
        el("div", { class: "row-main" }, [
          el("div", { class: "row-title", text: r.title }),
          el("div", { class: "row-meta", text: meta }),
        ]),
        el("div", { class: "row-actions" }, actions),
      ])
    );
  });
}

// --- History ---------------------------------------------------------------
function fmt(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

async function loadHistory() {
  const { redemptions } = await api("admin/redemptions");
  const list = clear($("history-list"));
  if (!redemptions.length) {
    list.appendChild(el("p", { class: "muted", text: "Nothing redeemed yet." }));
    return;
  }
  redemptions.forEach((h) => {
    list.appendChild(
      el("div", { class: "row" }, [
        el("div", { class: "row-icon" }, [icon(h.icon_snapshot)]),
        el("div", { class: "row-main" }, [
          el("div", { class: "row-title", text: h.title_snapshot }),
          el("div", { class: "row-meta", text: fmt(h.redeemed_at) }),
        ]),
        el("div", { class: "reward-chip" }, [coin("sm"), el("span", { text: `${h.cost_snapshot}` })]),
      ])
    );
  });
}

boot().catch((err) => toast(err.message, "error"));
