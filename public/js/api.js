// Shared frontend helpers: a small fetch client, safe DOM construction (no
// innerHTML with data → no XSS), icon rendering via CSS mask, the gold-balance
// chrome, and toast notifications. Imported by every page module.

// --- Fetch client ----------------------------------------------------------
let csrfToken = null;
export function setCsrf(token) {
  csrfToken = token;
}

export async function api(path, { method = "GET", body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  if (method !== "GET" && csrfToken) opts.headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(`api/${path}`, opts);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON / empty */
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// --- Safe DOM helpers ------------------------------------------------------
// Build an element. Text content is always set via textContent. Never pass
// user-supplied strings as HTML.
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") throw new Error("Refusing to set innerHTML"); // guard
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// --- Icons -----------------------------------------------------------------
let availableIcons = null;
export async function loadIcons() {
  if (availableIcons) return availableIcons;
  try {
    const { icons } = await api("icons");
    availableIcons = new Set(icons);
  } catch {
    availableIcons = new Set();
  }
  return availableIcons;
}

// A monochrome icon recolored by the surrounding text color (via CSS mask). The
// mask URL is set through the CSSOM (allowed under a strict, no-'unsafe-inline'
// CSP). Falls back to the placeholder when the name is unknown.
export function icon(name, extraClass = "") {
  const known = availableIcons && availableIcons.has(name);
  const file = known ? name : "placeholder";
  const span = el("span", { class: `icon ${extraClass}`.trim() });
  // Absolute URL (resolved against the page, which honors the /cheevos base) so
  // it works regardless of where the property is consumed.
  const url = `url("${new URL(`icons/${file}.svg`, document.baseURI).href}")`;
  span.style.webkitMaskImage = url;
  span.style.maskImage = url;
  return span;
}

// The full-color gold coin (used for the balance and point values).
export function coin(extraClass = "") {
  return el("img", { src: "icons/coin.svg", alt: "gold", class: `coin ${extraClass}`.trim() });
}

// Reward color tier by point cost: white 1-10, green 11-50, blue 51-99,
// purple 100+. Returns the tier name used as a CSS class suffix.
export function rewardTier(cost) {
  if (cost >= 100) return "purple";
  if (cost >= 51) return "blue";
  if (cost >= 11) return "green";
  return "white";
}

// --- Chrome (header nav + balance) ----------------------------------------
export async function initChrome(active) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === active) a.classList.add("active");
  });
  await applyTitle();
}

// Fetch the parent-configured caption and apply it to the header + tab title.
// Elements with [data-app-title] get the caption; a "-suffix" attribute appends
// (e.g. the admin header shows "<caption> — Parents").
export async function applyTitle() {
  let title = "Cheevos";
  try {
    title = (await api("settings")).title || title;
  } catch {
    /* keep default */
  }
  document.querySelectorAll("[data-app-title]").forEach((node) => {
    const suffix = node.getAttribute("data-suffix") || "";
    node.textContent = title + suffix;
  });
  document.title = title + (document.body.dataset.titleSuffix || "");
  return title;
}

export async function refreshBalance(value) {
  const slot = document.getElementById("gold-value");
  if (!slot) return;
  const v = value !== undefined ? value : (await api("balance")).balance;
  const prev = Number(slot.textContent.replace(/[^0-9-]/g, "")) || 0;
  slot.textContent = String(v);
  if (v !== prev) {
    const badge = document.getElementById("gold-badge");
    if (badge) {
      badge.classList.remove("pulse");
      void badge.offsetWidth; // restart animation
      badge.classList.add("pulse");
    }
  }
  return v;
}

// --- Toast -----------------------------------------------------------------
export function toast(message, kind = "info") {
  let host = document.getElementById("toasts");
  if (!host) {
    host = el("div", { id: "toasts" });
    document.body.appendChild(host);
  }
  const t = el("div", { class: `toast toast-${kind}`, text: message });
  host.appendChild(t);
  void t.offsetWidth;
  t.classList.add("show");
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 350);
  }, 2600);
}
