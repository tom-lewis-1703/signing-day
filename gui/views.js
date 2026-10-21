// Signing Day GUI screens (GUI-PLAN.md §3): pure functions from state to HTML, shared by
// app.js (live) and mockup.html (static data).

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (name, big = false) => `<span class="icon${big ? " big" : ""}" style="--i:url(icons/${name}.svg)" aria-hidden="true"></span>`;
const label = (text, cls = "") => `<span class="label ${cls}">${esc(text)}</span>`;

// ---- Colors: two accents from the user team's primary and secondary colors (§2) ----
const BG = "#000000", WHITE = "#FFFFFF", NEUTRAL = "#F4F4F7";
const valid = hex => /^#[0-9a-f]{6}$/i.test(hex || "");
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = hex => {
  const [r, g, b] = rgbOf(hex).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
function toHsl(hex) {
  const [r, g, b] = rgbOf(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
function fromHsl(h, s, l) {
  s /= 100; l = Math.min(100, Math.max(0, l)) / 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return "#" + [0, 8, 4].map(n => Math.round(f(n) * 255).toString(16).padStart(2, "0")).join("");
}
// The user team's own colors, unchanged. They are used as fills, edges and underlines (text on
// them uses whichever of black or white reads better). A color too dark to show on black is
// skipped: the other color leads and white is the second accent.
const usable = hex => valid(hex) && contrast(hex, BG) >= 1.6;
const inkOn = c => contrast(c, BG) >= contrast(c, WHITE) ? BG : WHITE;
export function accentFrom(colors) {
  const p = usable(colors?.primary) ? colors.primary : null, s = usable(colors?.secondary) ? colors.secondary : null;
  const accent = p ?? s ?? "#2BD4FF";
  const accent2 = p && s && p.toLowerCase() !== s.toLowerCase() ? s : p || s ? NEUTRAL : "#FF8A2B";
  return { accent, accent2, ink: inkOn(accent), ink2: inkOn(accent2) };
}
export const accentCss = colors => { const a = accentFrom(colors); return `--accent:${a.accent};--accent-2:${a.accent2};--accent-ink:${a.ink};--accent-2-ink:${a.ink2}`; };

// Monogram tile (no logo): the team's own primary color, kept readable against its text.
const tileCache = new Map();
function tileColors(hex) {
  if (tileCache.has(hex)) return tileCache.get(hex);
  const base = valid(hex) ? hex : "#2B2B38";
  const ink = contrast(base, WHITE) >= contrast(base, BG) ? WHITE : BG;
  const [h, s, l0] = toHsl(base);
  let bg = base, l = l0;
  while (contrast(bg, ink) < 4.5 && l > 0 && l < 100) { l += ink === WHITE ? -5 : 5; bg = fromHsl(h, s, l); }
  tileCache.set(hex, { bg, ink });
  return { bg, ink };
}
// A team's mark: its logo from the asset library, else a monogram tile.
export const tile = t => {
  if (t?.logo) return `<img class="logo" src="${esc(t.logo)}" alt="" loading="lazy">`;
  const c = tileColors(t?.colors?.primary);
  return `<span class="tile" style="background:${c.bg};color:${c.ink}" aria-hidden="true">${esc(t?.short)}</span>`;
};

// ---- Small components ----
const statusTag = s => s ? `<span class="tag ${esc(s)}">[ ${esc(s)} ]</span>` : `<span class="muted">—</span>`;
// Roster next season, before → after the plan.
const roster = (before, after, large = false) => `<span class="roster${large ? " large" : ""}" aria-label="Roster ${before} before, ${after} after">` +
  `<span class="muted">${before}</span> → <b>${after}</b></span>`;
// Fixed column widths (px, or "n%" of the table; null = shares the rest), so columns never move
// with sorting, filters or the team shown.
const cols = widths => `<colgroup>${widths.map(w => w == null ? "<col>" : `<col style="width:${typeof w === "number" ? `${w}px` : w}">`).join("")}</colgroup>`;
const btn = (text, attrs = "", cls = "", ic = "") => `<button type="button" class="btn ${cls}" ${attrs}>${ic ? icon(ic) : ""}${esc(text)}</button>`;
const empty = (ic, sentence, button) => `<div class="empty">${icon(ic, true)}<p>${esc(sentence)}</p>${button}</div>`;
const fmtTime = iso => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// ---- Teams list: tabs, search, chips, sort (shared with app.js for Previous/Next) ----
export const TEAM_TABS = [["all", "ALL"], ["CHANGED", "CHANGED"], ["RE-CHECK", "RE-CHECK"], ["REVIEWED", "REVIEWED"]];
const CHIPS = [["deletions", "Has deletions", t => t.counts.deleted > 0], ["under80", "Roster under 80", t => t.rosterAfter < 80]];
const STATUS_ORDER = { "RE-CHECK": 0, CHANGED: 1, REVIEWED: 2, "": 3 };
const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  prestige: (a, b) => a.prestige - b.prestige,
  roster: (a, b) => a.rosterAfter - b.rosterAfter || a.rosterBefore - b.rosterBefore,
  in: (a, b) => a.counts.in - b.counts.in,
  out: (a, b) => a.counts.out - b.counts.out,
  deleted: (a, b) => a.counts.deleted - b.counts.deleted,
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
};
export function listTeams(teams, f, tab = f.tab) {
  const q = f.q.trim().toLowerCase();
  const chips = CHIPS.filter(([id]) => f.chips.includes(id)).map(([, , test]) => test);
  return teams.filter(t => (tab === "all" || t.status === tab) && (!q || t.name.toLowerCase().includes(q) || t.short.toLowerCase().includes(q)) && chips.every(test => test(t)))
    .sort((a, b) => f.dir * SORTS[f.sort](a, b) || SORTS.name(a, b));
}

// ---- Shell: sidebar, top bar, content ----
function shell(ui, active, crumbs, body) {
  const plan = ui.plan;
  const item = (id, text, ic, href, attrs = "") => !plan && id !== "start"
    ? `<li><span class="off">${icon(ic)}${esc(text)}</span></li>`
    : `<li><a href="${href}" ${attrs} class="${active === id ? "active" : ""}" ${active === id ? 'aria-current="page"' : ""}>${icon(ic)}${esc(text)}</a></li>`;
  const crumbHtml = `<span class="prompt" aria-hidden="true">&gt;</span>` + crumbs.map(([text, href], i) => i === crumbs.length - 1
    ? `<span class="here">${esc(text)}</span>` : `<a href="${href}">${esc(text)}</a><span aria-hidden="true">›</span>`).join("");
  return `<div class="shell">
  <aside class="sidebar">
    <div class="brand"><span class="mark">TTT</span><div><b>Transfer Tools</b><span>SIGNING DAY</span></div></div>
    ${plan ? `<div class="save-box"><div class="who">${tile(plan.userTeam)}<span>${esc(plan.userTeam?.name)}</span></div><div class="file">${esc(plan.save.fileName)}</div></div>` : ""}
    <nav aria-label="Main"><ul class="menu">
      ${item("start", "Open save", "folder-open", "#/start")}
      ${item("overview", "Overview", "layout-dashboard", "#/overview")}
      ${item("teams", "Teams", "users", "#/teams")}
      ${item("save", "Save…", "device-floppy", "#/overview", 'data-action="save-modal"')}
    </ul></nav>
  </aside>
  <div class="main">
    <header class="topbar"><nav class="crumbs" aria-label="Breadcrumb">${crumbHtml}</nav>${ui.busy ? `<span class="busy label" role="status">${esc(ui.busy)}</span>` : plan ? `<span class="label stage">${esc(plan.save.stage)}</span>` : ""}</header>
    <main class="content">${ui.error ? `<div class="notice error" role="alert">${icon("alert-triangle")}<span>${esc(ui.error)}</span></div>` : ""}${body}</main>
  </div>
</div>${ui.modal ? saveModal(ui) : ""}`;
}

// ---- S0 Start ----
function startView(ui) {
  const saves = ui.saves || [];
  const dir = saves[0]?.path.replace(/[\\/][^\\/]*$/, "") ?? "";
  const list = saves.length ? `<div class="table-wrap"><table>${cols([null, 240])}
      <thead><tr><th scope="col">Name</th><th scope="col" class="num">Modified</th></tr></thead>
      <tbody>${saves.map(s => `<tr class="link${ui.opened?.path === s.path ? " selected" : ""}" data-action="open-save" data-path="${esc(s.path)}">
        <td class="name"><a href="#/start" data-action="open-save" data-path="${esc(s.path)}">${esc(s.name)}</a></td><td class="num">${esc(fmtTime(s.modified))}</td></tr>`).join("")}</tbody>
    </table></div>` : empty("folder-open", "No dynasty saves found in the CFB 27 saves folder.", btn("Refresh", 'data-action="refresh-saves"'));

  const o = ui.opened;
  let team;
  if (!o) team = `<p class="muted">Open a save to pick your team.</p>`;
  else if (o.stage.id !== "signing-day") team = `<div class="kv">${label("File")}<span>${esc(o.fileName)}</span>${label("Stage")}<span>${esc(o.stage.label)}</span></div>
      <div class="notice">${icon("alert-triangle")}<span>This tool works on a Signing Day save.</span></div>`;
  else {
    const picked = o.teams.find(t => t.index === ui.picked);
    team = `<div class="kv">${label("File")}<span>${esc(o.fileName)}</span>${label("Stage")}<span>${esc(o.stage.label)}</span></div>
      <label class="field"><span class="label">Your team (never changed)</span>
        <select class="input" id="user-team" data-input="user-team">
          <option value="">Pick your team…</option>
          ${o.teams.map(t => `<option value="${t.index}"${t.index === ui.picked ? " selected" : ""}>${esc(t.name)}</option>`).join("")}
        </select></label>
      <div class="row">${picked ? `<span class="save-line">${tile(picked)}<b>${esc(picked.name)}</b></span>` : ""}<span class="grow"></span>
        ${btn("Continue", `data-action="continue"${picked && !ui.busy ? "" : " disabled"}`, "primary", "chevron-right")}</div>`;
  }
  return `<div class="page-head"><h1>Open a save</h1><p>Pick a Signing Day save, then your team. Nothing is written until you save.</p></div>
  <div class="start-grid">
    <section class="card" aria-labelledby="saves-h"><h2 id="saves-h">Saves</h2>${dir ? `<p class="mono muted">${esc(dir)}</p>` : ""}${list}</section>
    <div class="stack">
      <section class="card" aria-labelledby="other-h"><h2 id="other-h">Other saves</h2>
        <div class="row"><label class="field grow"><span class="label">Save path</span>
          <input class="input mono" id="other-path" data-input="other-path" value="${esc(ui.other)}" placeholder="C:\\…\\DYNASTY-…" spellcheck="false"></label>
          ${btn("Open", 'data-action="open-other"', "", "folder-open")}</div>
      </section>
      <section class="card" aria-labelledby="team-h"><h2 id="team-h">Your team</h2>${team}</section>
    </div>
  </div>`;
}

// ---- S1 Overview ----
function overviewView(ui) {
  const { summary: s, save, userTeam } = ui.plan;
  // Non-breaking hyphen: "UN-SIGNED" never splits across lines.
  const stat = (text, n, cls) => `<div class="stat ${cls}"><span class="label">${esc(text).replace(/-/g, "&#8209;")}</span><span class="big">${n}</span></div>`;
  return `<div class="page-head"><h1>Signing Day plan</h1><p>Every CPU team's moves for this save. Nothing is written until you save.</p></div>
  <section class="scoreboard" aria-label="Plan totals">
    ${stat("Transfers placed", s.placed, "in")}${stat("Dropped", s.dropped, "warn")}${stat("Recruits un-signed", s.unsigned, "orange")}${stat("Players deleted", s.deleted, "out")}${stat("Players moved", s.moved, "moved")}
  </section>
  <p class="save-line">${icon("file")}<b>${esc(save.fileName)}</b><span class="sep">|</span><span>${esc(save.stage)}</span><span class="sep">|</span>${tile(userTeam)}<b>${esc(userTeam?.name)}</b><span>(your team, never changed)</span></p>
  <div><div class="actionbar"><a class="btn primary" href="#/teams">${icon("users")}Review teams</a>${btn("Save…", 'data-action="save-modal"', "", "device-floppy")}</div></div>`;
}

// ---- S2 Teams list ----
function teamsView(ui) {
  const f = ui.teams, teams = ui.plan.teams;
  const rows = listTeams(teams, f);
  const tabs = TEAM_TABS.map(([id, text]) => `<button type="button" class="tab${f.tab === id ? " active" : ""}" role="tab" aria-selected="${f.tab === id}" data-action="teams-tab" data-tab="${id}">${text} <span class="n">${listTeams(teams, { ...f, q: "", chips: [] }, id).length}</span></button>`).join("");
  const chips = CHIPS.map(([id, text]) => `<button type="button" class="chip" aria-pressed="${f.chips.includes(id)}" data-action="chip" data-chip="${id}">${esc(text)}</button>`).join("");
  // The sort arrow's space is kept in every header (hidden when not sorted), so labels never shift.
  const th = (key, text, num = false) => `<th scope="col" class="${num ? "num" : ""}" aria-sort="${f.sort === key ? (f.dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" data-action="sort" data-sort="${key}">${esc(text)}<span class="dir${f.sort === key ? "" : " off"}" aria-hidden="true">${f.sort === key && f.dir > 0 ? "▲" : "▼"}</span></button></th>`;
  const table = rows.length ? `<div class="table-wrap"><table>${cols([66, "30%", "10%", "14%", "8%", "8%", "10%", null])}
    <thead><tr><th scope="col"><span class="sr">Logo</span></th>${th("name", "Team")}${th("prestige", "Prestige", true)}${th("roster", "Roster", true)}${th("in", "In", true)}${th("out", "Out", true)}${th("deleted", "Deleted", true)}${th("status", "Status")}</tr></thead>
    <tbody>${rows.map(t => `<tr class="link" data-href="#/team/${t.index}">
      <td class="tile-cell">${tile(t)}</td><td class="name"><a href="#/team/${t.index}">${esc(t.name)}</a></td>
      <td class="num">${t.prestige}</td><td class="num">${roster(t.rosterBefore, t.rosterAfter)}</td>
      <td class="num">${t.counts.in}</td><td class="num">${t.counts.out}</td><td class="num">${t.counts.deleted}</td><td>${statusTag(t.status)}</td></tr>`).join("")}</tbody>
  </table></div>` : `<div class="card">${empty("search", "No teams match these filters.", btn("Clear filters", 'data-action="clear-filters"'))}</div>`;
  return `<div class="page-head"><h1>Teams</h1><p>${teams.length} CPU teams. Open a team to review its moves.</p></div>
  <div class="tabs" role="tablist">${tabs}</div>
  <div class="filterbar">
    <label class="search">${icon("search")}<span class="sr">Search teams</span><input id="team-search" data-input="search" type="search" placeholder="search teams" value="${esc(f.q)}" autocomplete="off"></label>
    <div class="chips"><span class="label">${icon("filter")} Filter</span>${chips}</div>
  </div>
  ${table}`;
}

// ---- S3 Team review: IN and OUT side by side, KEPT under them ----
function teamView(ui, t, nav) {
  const dis = ui.busy ? " disabled" : "";
  const undo = (r, kind) => btn("Undo", `data-action="undo" data-player="${r.playerIndex}" data-team="${t.index}" data-kind="${kind}"${dis}`, "small", "arrow-back-up");
  const player = (r, extra = "") => `<td class="name"><b>${esc(r.name)}</b>${extra}</td><td>${esc(r.pos)}</td><td class="num">${r.ovr}</td>`;
  const head = cols => `<thead><tr>${cols.map(([c, num]) => `<th scope="col" class="${num ? "num" : ""}">${esc(c)}</th>`).join("")}<th scope="col"><span class="sr">Action</span></th></tr></thead>`;
  const result = r => r.result === "Moved" ? `<span class="res moved">${icon("arrows-exchange")}Moved → ${esc(r.to)}</span>`
    : r.result === "Deleted" ? `<span class="res out">${icon("trash")}Deleted</span>` : `<span class="res unsigned">${icon("arrow-up-circle")}Un-signed</span>`;
  const panel = (cls, ic, title, n, hint, body) => `<section class="panel ${cls}" aria-label="${esc(title)}"><header>${icon(ic)}<h2>${esc(title)}</h2><span class="n">${n}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</header>${body}</section>`;

  const inBody = t.in.length ? `<table class="actions-table">${cols([null, 84, 72, 230, 150, 130])}${head([["Player"], ["Pos"], ["OVR", 1], ["From"], ["Role here"]])}<tbody>${t.in.map(r =>
      `<tr>${player(r)}<td>${esc(r.from)}</td><td>${esc(r.role ?? "—")}</td><td class="act">${undo(r, "in")}</td></tr>`).join("")}</tbody></table>`
    : `<p class="none">No transfers placed here.</p>`;
  const outBody = t.out.length ? `<table class="actions-table">${cols([240, 84, 64, 280, null, 130])}${head([["Player"], ["Pos"], ["OVR", 1], ["Result"], ["Reason"]])}<tbody>${t.out.map(r =>
      `<tr>${player(r, r.kind === "Recruit" ? ` <span class="muted">recruit</span>` : "")}<td>${result(r)}</td><td class="muted wrap">${esc(r.reason)}</td><td class="act">${undo(r, "out")}</td></tr>`).join("")}</tbody></table>`
    : `<p class="none">Nobody leaves this team.</p>`;
  const keptBody = t.kept.length ? `<table class="actions-table">${cols([null, 84, 72, 300, 360, 150])}${head([["Player"], ["Pos"], ["OVR", 1], ["Undone"], ["Now"]])}<tbody>${t.kept.map(r =>
      `<tr>${player(r)}<td><span class="tag KEPT">[ KEPT ]</span> ${esc(r.undone)}</td><td>${esc(r.now)}</td><td class="act">${btn("Restore", `data-action="restore" data-player="${r.playerIndex}" data-team="${t.index}"${dis}`, "small", "arrow-forward-up")}</td></tr>`).join("")}</tbody></table>`
    : `<p class="none">Nothing undone at this team. Undo a move above and it shows here.</p>`;

  const reviewed = t.status === "REVIEWED";
  const mark = t.helmet ? `<img class="helmet" src="${esc(t.helmet)}" alt="">` : tile(t);
  return `<section class="card"><div class="team-head">${mark}
      <div class="title"><h1>${esc(t.name)}</h1><div class="meta"><span>${label("Prestige")} <span class="mono">${t.prestige}</span></span>${statusTag(t.status)}</div></div>
      <div class="field"><span class="label">Roster next season</span>${roster(t.rosterBefore, t.rosterAfter, true)}</div></div></section>
  <div class="panels">
    ${panel("in", "arrow-down-circle", "In", t.counts.in, "transfers placed here", inBody)}
    ${panel("out", "arrow-up-circle", "Out", t.counts.out, "un-signed, deleted or moved", outBody)}
  </div>
  ${panel("kept", "arrow-back-up", "Kept", t.counts.kept, "undone moves", keptBody)}
  <div class="footer-bar"><div class="actionbar">
    ${nav.prev ? `<a class="btn" href="#/team/${nav.prev.index}">${icon("chevron-left")}Previous team</a>` : btn("Previous team", "disabled", "", "chevron-left")}
    ${btn(reviewed ? "Mark not reviewed" : "Mark reviewed", `data-action="review" data-team="${t.index}" data-reviewed="${!reviewed}"${dis}`, "primary", "check")}
    ${nav.next ? `<a class="btn" href="#/team/${nav.next.index}">Next team${icon("chevron-right")}</a>` : btn("Next team", "disabled", "", "chevron-right")}
  </div></div>`;
}

// ---- S4 Save confirm (modal) and the result screen ----
function saveModal(ui) {
  const p = ui.plan, s = p.summary, m = ui.modal;
  const notReviewed = p.teams.filter(t => t.status === "CHANGED" || t.status === "RE-CHECK").length;
  const kv = (k, v, cls = "") => `${label(k)}<span class="num ${cls}">${v}</span>`;
  return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="save-h">
    <h2 id="save-h">Save this plan?</h2>
    <p class="muted">${esc(p.save.fileName)}: a backup is made first, then the saved file is reopened and checked.</p>
    <div class="kv">
      ${kv("Transfers placed", s.placed)}${kv("Dropped", s.dropped)}${kv("Recruits un-signed", s.unsigned)}${kv("Players deleted", s.deleted)}${kv("Players moved", s.moved)}
      ${kv("Undos", p.locks.count)}${kv("Teams not reviewed", notReviewed, notReviewed > 0 ? "warn" : "")}
    </div>
    ${m.failed ? `<div class="notice error" role="alert">${icon("alert-triangle")}<span>Not saved. ${m.failed.map(esc).join("<br>")}</span></div>` : ""}
    <div><div class="actionbar">${btn(m.saving ? "Saving…" : "Save", `data-action="save-confirm"${m.saving ? " disabled" : ""}`, "primary", "device-floppy")}${btn("Cancel", `data-action="save-cancel"${m.saving ? " disabled" : ""}`)}</div></div>
  </div></div>`;
}

function savedView(ui) {
  const r = ui.saved;
  return `<section class="card result">${icon("check", true)}<h1>Saved</h1>
    <p>The save passed the reopen check. Backup of the original:</p><p class="path">${esc(r.backupPath)}</p>
    <a class="btn primary" href="#/start" data-action="open-another">${icon("folder-open")}Open another save</a></section>`;
}

// ---- Page for a route: { name: start|overview|teams|team|saved, index } ----
export function page(route, ui) {
  const save = ui.plan ? [[ui.plan.save.fileName, "#/overview"]] : [];
  switch (route.name) {
    case "overview": return shell(ui, "overview", [...save, ["Overview"]], overviewView(ui));
    case "teams": return shell(ui, "teams", [...save, ["Teams"]], teamsView(ui));
    case "team": {
      const t = ui.plan.teams.find(x => x.index === route.index);
      if (!t) return shell(ui, "teams", [...save, ["Teams", "#/teams"], ["Unknown team"]], empty("users", "That team isn't in this plan.", `<a class="btn" href="#/teams">Back to teams</a>`));
      let order = listTeams(ui.plan.teams, ui.teams);
      if (!order.includes(t)) order = listTeams(ui.plan.teams, { tab: "all", q: "", chips: [], sort: "name", dir: 1 });
      const i = order.indexOf(t);
      return shell(ui, "teams", [...save, ["Teams", "#/teams"], [t.name]], teamView(ui, t, { prev: order[i - 1], next: order[i + 1] }));
    }
    case "saved": return shell({ ...ui, plan: null }, "start", [["Saved"]], savedView(ui));
    default: return shell(ui, "start", [["Open a save"]], startView(ui));
  }
}
