// Signing Day GUI (GUI-PLAN.md): state, API calls and events. The screens are in views.js.
import { page, accentCss } from "./views.js";

const app = document.getElementById("app");
const ui = {
  plan: null, saves: null, opened: null, picked: null, other: "", busy: "", error: "",
  teams: { tab: "all", q: "", chips: [], sort: "name", dir: 1 }, modal: null, saved: null
};

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `The server answered ${res.status}.` }));
  if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
  return data;
}

function route() {
  const m = location.hash.match(/^#\/(\w+)(?:\/(\d+))?/);
  return { name: m?.[1] ?? "start", index: m?.[2] === undefined ? undefined : Number(m[2]) };
}

function render() {
  const r = route();
  if (!ui.plan && ["overview", "teams", "team"].includes(r.name)) return location.replace("#/start");
  if (r.name === "saved" && !ui.saved) return location.replace("#/start");
  // Accents: the user team's colors (on the start screen, the team being picked).
  const colors = ui.plan?.userTeam?.colors ?? ui.opened?.teams.find(t => t.index === ui.picked)?.colors;
  document.documentElement.style.cssText = colors ? accentCss(colors) : "";
  // Keep the focus (and the caret in a text box) across re-renders.
  const active = document.activeElement, focusId = active?.id, caret = active?.selectionStart;
  app.innerHTML = page(r, ui);
  const el = focusId && document.getElementById(focusId);
  if (el) { el.focus(); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); }
}

// Runs one server call at a time with a busy label in the top bar; errors show as a notice.
async function run(label, fn) {
  if (ui.busy) return;
  ui.busy = label; ui.error = ""; render();
  try { await fn(); } catch (e) { ui.error = e.message; }
  ui.busy = ""; render();
}

const openSave = path => run("Opening the save…", async () => {
  ui.opened = null; ui.picked = null; ui.plan = null;
  ui.opened = await api("/api/open", { path });
  ui.picked = ui.opened.suggestedUserTeam;
  if (location.hash !== "#/start") location.hash = "#/start";
});

const loadSaves = () => run("Reading the saves folder…", async () => { ui.saves = await api("/api/saves"); });

const actions = {
  "open-save": el => openSave(el.dataset.path),
  "open-other": () => ui.other.trim() && openSave(ui.other.trim()),
  "refresh-saves": loadSaves,
  "continue": () => run("Building the plan…", async () => {
    ui.plan = await api("/api/user-team", { teamIndex: ui.picked });
    ui.teams = { tab: "all", q: "", chips: [], sort: "name", dir: 1 };
    location.hash = "#/overview";
  }),
  "teams-tab": el => { ui.teams.tab = el.dataset.tab; render(); },
  "chip": el => {
    const id = el.dataset.chip, chips = ui.teams.chips;
    ui.teams.chips = chips.includes(id) ? chips.filter(c => c !== id) : [...chips, id];
    render();
  },
  "clear-filters": () => { ui.teams = { ...ui.teams, tab: "all", q: "", chips: [] }; render(); },
  // Same column flips the order; a new column starts A–Z for names and statuses, high-first for numbers.
  "sort": el => {
    const key = el.dataset.sort, f = ui.teams;
    if (f.sort === key) f.dir = -f.dir;
    else { f.sort = key; f.dir = key === "name" || key === "status" ? 1 : -1; }
    render();
  },
  "undo": el => run("Rebuilding the plan…", async () => {
    ui.plan = await api("/api/undo", { playerIndex: Number(el.dataset.player), teamIndex: Number(el.dataset.team), kind: el.dataset.kind });
  }),
  "restore": el => run("Rebuilding the plan…", async () => {
    ui.plan = await api("/api/restore", { playerIndex: Number(el.dataset.player), teamIndex: Number(el.dataset.team) });
  }),
  "review": el => run("Saving…", async () => {
    ui.plan = await api("/api/review", { teamIndex: Number(el.dataset.team), reviewed: el.dataset.reviewed === "true" });
  }),
  "save-modal": () => { if (ui.plan) { ui.modal = {}; render(); } },
  "save-cancel": () => { if (!ui.modal?.saving) { ui.modal = null; render(); } },
  "save-confirm": async () => {
    if (ui.modal?.saving) return;
    ui.modal = { saving: true }; render();
    try {
      const r = await api("/api/save", {});
      if (r.ok) {
        ui.saved = r; ui.plan = null; ui.opened = null; ui.picked = null; ui.modal = null;
        location.hash = "#/saved";
      } else {
        ui.modal = { failed: r.failed };
        ui.plan = await api("/api/plan");
      }
    } catch (e) { ui.modal = { failed: [e.message] }; }
    render();
  },
  "open-another": () => { ui.saved = null; loadSaves(); }
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (el && !el.disabled && actions[el.dataset.action]) {
    if (el.tagName === "A") e.preventDefault();
    if (el.dataset.action === "open-another") location.hash = "#/start";
    actions[el.dataset.action](el);
    return;
  }
  const row = e.target.closest("tr[data-href]");
  if (row && !e.target.closest("a, button")) location.hash = row.dataset.href;
});

document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.input === "search") { ui.teams.q = t.value; render(); }
  else if (t.dataset.input === "other-path") ui.other = t.value;
});

document.addEventListener("change", e => {
  if (e.target.dataset.input === "user-team") { ui.picked = e.target.value === "" ? null : Number(e.target.value); render(); }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && ui.modal && !ui.modal.saving) { ui.modal = null; render(); }
  if (e.key === "Enter" && e.target.dataset?.input === "other-path") actions["open-other"]();
});

addEventListener("hashchange", () => { render(); scrollTo(0, 0); });

// The server keeps the open save across page refreshes.
try { ui.plan = await api("/api/plan"); } catch { ui.plan = null; }
try { ui.saves = await api("/api/saves"); } catch (e) { ui.error = e.message; }
if (!location.hash || (!ui.plan && route().name !== "start")) location.replace(ui.plan ? "#/overview" : "#/start");
render();
