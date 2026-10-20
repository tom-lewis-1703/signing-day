const $ = id => document.getElementById(id);
const VIEWS = ["stage", "portal", "teams", "signing"];
const S = {
  info: null,        // last open() result
  view: "stage",
  portal: null,      // { players, roomOrder }
  picked: null,      // portal player index
  pickedName: "",
  teams: null,       // league summary rows
  projects: false,
  teamIndex: null,   // team shown on the Teams view
  signing: null,     // Signing Day plan
  pending: []
};

// ---------- helpers ----------
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids.filter(k => k !== null && k !== undefined && k !== false));
  return e;
}

function log(msg, cls = "") {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  $("log").prepend(el("div", { className: cls, textContent: line }));
  $("status").textContent = line;
  $("status").className = cls || "muted";
}

async function call(name, ...args) {
  const res = await window.ttt[name](...args);
  if (!res.ok) { log(`${name} failed: ${res.error}`, "bad"); return null; }
  return res.result;
}

// Runs fn with the buttons locked and a status message.
async function busy(msg, fn) {
  document.body.classList.add("busy");
  const btns = [...document.querySelectorAll("button:not(:disabled)")];
  btns.forEach(b => { b.disabled = true; });
  $("status").textContent = msg; $("status").className = "warn";
  try { return await fn(); }
  finally {
    btns.forEach(b => { b.disabled = false; });
    document.body.classList.remove("busy");
    if ($("status").textContent === msg) { $("status").textContent = "Ready."; $("status").className = "muted"; }
  }
}

const n = x => (x ?? 0).toLocaleString();
const grade = g => g == null ? "–" : String(g).replace("minus", "−").replace("plus", "+");
const kvRows = (table, rows) => $(table).replaceChildren(...rows.filter(Boolean).map(([k, v, cls]) =>
  el("tr", {}, el("th", { textContent: k }), el("td", { textContent: v, className: cls || "" }))));

// cols: { h, v(row), num, cls (string or fn), key (sortable), tip }
function grid(cols, rows, { onClick, selected, sort, onSort } = {}) {
  const head = el("tr", {}, ...cols.map(c => {
    const mark = sort && c.key === sort.key ? (sort.desc ? " ▼" : " ▲") : "";
    const th = el("th", { textContent: c.h + mark, className: [c.num ? "num" : "", sort && c.key ? "sort" : ""].join(" ").trim(), title: c.tip || "" });
    if (sort && c.key) th.addEventListener("click", () => onSort(c));
    return th;
  }));
  const body = rows.map(r => {
    const tr = el("tr", {}, ...cols.map(c => {
      const className = [c.num ? "num" : "", typeof c.cls === "function" ? c.cls(r) : c.cls || ""].join(" ").trim();
      return c.node ? el("td", { className }, c.node(r)) : el("td", { textContent: c.v(r) ?? "", className });
    }));
    if (onClick) { tr.classList.add("click"); tr.addEventListener("click", () => onClick(r)); }
    if (selected && selected(r)) tr.classList.add("sel");
    return tr;
  });
  return el("table", { className: "grid" }, head, ...body);
}

function sortBy(rows, cols, sort) {
  const c = cols.find(x => x.key === sort.key);
  return [...rows].sort((a, b) => {
    const val = c.sortValue || c.v, va = val(a), vb = val(b);
    const d = c.num ? va - vb : String(va).localeCompare(String(vb));
    return sort.desc ? -d : d;
  });
}

// ---------- views ----------
function showView(view) {
  S.view = view;
  for (const b of $("nav").querySelectorAll("button")) b.classList.toggle("active", b.dataset.view === view);
  for (const v of VIEWS) $(`v-${v}`).hidden = v !== view;
  window.scrollTo(0, 0);
  if (view === "portal") return loadPortal();
  if (view === "teams") return loadTeams();
  if (view === "signing") return loadSigning();
}
$("nav").addEventListener("click", e => { const v = e.target.dataset?.view; if (v && !e.target.disabled) showView(v); });

// ---------- open / save ----------
async function openPath(filePath) {
  const info = await busy(`Opening ${filePath}…`, () => call("open", filePath));
  if (!info) return null;
  Object.assign(S, { info, portal: null, picked: null, pickedName: "", teams: null, teamIndex: info.userTeam?.teamIndex ?? null, signing: null, pending: [] });
  for (const b of $("nav").querySelectorAll("button")) b.disabled = false;
  $("saveBtn").disabled = false;
  $("reopenBtn").hidden = true;
  renderHeader();
  renderStage();
  log(`Opened ${info.fileName} in ${(info.openMs / 1000).toFixed(1)} s: ${info.stage.label}.`, info.stage.supported ? "good" : "warn");
  showView("stage");
  return info;
}

function renderHeader() {
  const i = S.info;
  $("fileInfo").textContent = `${i.fileName} · ${i.stage.label} · ${i.userTeam?.name ?? `user team "${i.settings.userTeam}" not found`}`;
  $("fileInfo").title = i.filePath;
  $("pending").textContent = S.pending.length ? `Unsaved: ${S.pending.join("; ")}` : "";
  $("saveBtn").classList.toggle("primary", S.pending.length > 0);
}

$("openBtn").addEventListener("click", async () => {
  const picked = await call("chooseSave");
  if (picked) await openPath(picked);
});

$("reopenBtn").addEventListener("click", () => openPath($("reopenBtn").dataset.path));

$("saveBtn").addEventListener("click", async () => {
  const r = await busy("Saving (backup, write, verify)…", () => call("save"));
  if (!r) return;
  S.pending = [];
  renderHeader();
  if (r.draftLockRecord) log(`Draft Lock record: ${r.draftLockRecord}`);
  log(`Saved${r.changes.length ? ` (${r.changes.join("; ")})` : " (no changes)"} in ${(r.saveMs / 1000).toFixed(1)} s. Verified ${r.check.stage}, ${n(r.check.playerCount)} players. Backup: ${r.backup.backupPath}`, "good");
});

// ---------- stage ----------
function renderStage() {
  const { stage: st, counts: c, draftCheck: dc, userTeam } = S.info;
  $("empty").hidden = true;
  $("stageBody").hidden = false;
  const leaving = st.id === "players-leaving";
  kvRows("facts", [
    ["File", S.info.filePath],
    ["Stage", st.label + (st.unconfirmed ? " (not yet confirmed on a real save)" : ""), st.supported ? "good" : "warn"],
    ["Season", `${st.seasonYear ?? "?"} (dynasty year ${st.dynastyYear})`],
    ["Your team", userTeam ? `${userTeam.name}, ${c.userTeamRoster} on roster` : `"${S.info.settings.userTeam}" (settings.json) not found in this save`, userTeam ? "" : "bad"],
    ["Rostered players", n(c.rostered)],
    ["Leaving early for draft", n(c.earlyDraft)],
    ["Underclassmen set to leave", leaving ? `${dc.underclassmenLeaving} (Draft Lock keeps them; ${dc.graduatingLeaving} graduating and ${dc.userTeamLeaving} on your team still leave)` : n(dc.underclassmenLeaving), leaving || !dc.underclassmenLeaving ? "" : "bad"],
    ["Entering portal", n(c.enteringPortal)],
    ["Transfers uncommitted / committed", `${n(c.portalUncommitted)} / ${n(c.portalCommitted)}`],
    ["Recruits committed", n(c.recruitsCommitted)]
  ]);
  $("dlText").textContent = leaving
    ? "Sets every early-draft declaration of a player with eligibility left to Staying (your team is skipped). Preview, Apply, then Save."
    : "Draft Lock only runs on a Players Leaving save.";
  $("dlPreview").disabled = !leaving;
  $("dlApply").disabled = true;
  $("dlResult").textContent = "";
  $("dlTables").replaceChildren();
}

$("dlPreview").addEventListener("click", async () => {
  const plan = await call("draftLockPreview");
  if (!plan) return;
  $("dlResult").className = "";
  $("dlResult").textContent = `Will lock ${plan.toLock.length} players at ${plan.byTeam.length} teams. ${plan.graduating.length} graduating players still leave. ` +
    `Your team left as is: ${plan.userTeam.map(p => `${p.name} ${p.position} ${p.overall}`).join(", ") || "none"}. ` +
    `${plan.alsoEnteringPortal} locked players are also entering the portal (left alone).`;
  $("dlApply").disabled = plan.toLock.length === 0 || S.pending.length > 0;
  $("dlTables").replaceChildren(
    grid([{ h: "Team", v: t => t.team }, { h: "Locked", v: t => t.count, num: true }], plan.byTeam),
    grid([{ h: "Player", v: p => p.name }, { h: "Pos", v: p => p.position }, { h: "OVR", v: p => p.overall, num: true },
      { h: "Year", v: p => `${p.schoolYear}${p.redshirtStatus === "Previous" ? " (RS)" : ""}` }, { h: "Team", v: p => p.team },
      { h: "Proj. Round", v: p => p.projectedRound, num: true }, { h: "Also Portal", v: p => p.alsoEnteringPortal ? "yes" : "" }], plan.toLock));
  log(`Draft Lock preview: ${plan.toLock.length} players.`);
});

$("dlApply").addEventListener("click", async () => {
  const r = await busy("Applying Draft Lock…", () => call("draftLockApply"));
  if (!r) return;
  $("dlApply").disabled = true; $("dlPreview").disabled = true;
  $("dlResult").textContent = r.verified
    ? `Applied and verified: ${r.locked.length} players now Staying. Click Save to write it.`
    : `Applied, but verification found problems: ${r.problems.join("; ")}. Do not save; reopen the file.`;
  $("dlResult").className = r.verified ? "good" : "bad";
  S.pending = [`Draft Lock (${r.locked.length})`];
  S.teams = null; S.portal = null;   // projections change after the lock
  renderHeader();
  log(`Draft Lock applied to ${r.locked.length} players (${r.verified ? "verified" : "VERIFY FAILED"}).`, r.verified ? "good" : "bad");
});

// ---------- portal ----------
async function loadPortal() {
  if (S.portal) return;
  const data = await busy("Loading portal players…", () => call("portalPlayers"));
  if (!data) return;
  S.portal = data;
  $("pRoom").replaceChildren(el("option", { value: "", textContent: "All positions" }), ...data.roomOrder.map(r => el("option", { value: r, textContent: r })));
  renderPortalList();
}

const PORTAL_COLS = [
  { h: "OVR", v: p => p.overall, num: true }, { h: "Pos", v: p => p.position }, { h: "Player", v: p => p.name },
  { h: "Yr", v: p => ({ Freshman: "Fr", Sophomore: "So", Junior: "Jr", Senior: "Sr" })[p.year] ?? p.year }, { h: "From", v: p => p.from }
];

function renderPortalList() {
  const all = S.portal.players, q = $("pFilter").value.trim().toLowerCase(), room = $("pRoom").value;
  const min = /^\d+$/.test(q) ? Number(q) : null;
  const list = all.filter(p => (!room || p.room === room) &&
    (!q || (min !== null ? p.overall >= min : `${p.name} ${p.from} ${p.position}`.toLowerCase().includes(q))));
  $("pCount").textContent = all.length ? `${list.length} of ${all.length} uncommitted transfers` : "No uncommitted transfers at this stage.";
  $("pList").replaceChildren(grid(PORTAL_COLS, list, { onClick: pickPlayer, selected: p => p.index === S.picked }));
}
$("pFilter").addEventListener("input", renderPortalList);
$("pRoom").addEventListener("change", renderPortalList);

async function pickPlayer(p) {
  S.picked = p.index; S.pickedName = p.name;
  renderPortalList();
  const w = await call("destinations", p.index);
  if (!w) return;
  $("pEmpty").hidden = true;
  $("pRole").textContent = "";
  const dealbreaker = w.dealbreaker === "none" && w.originalDealbreaker ? "none (Playing Time dropped: below his position average)"
    : w.dealbreaker + (w.dealbreaker !== "none" && w.dealbreakerBar ? ` (needs ${grade(w.dealbreakerBar)})` : "");
  kvRows("pSummary", [
    ["Player", `${w.player} · ${w.position} ${w.overall} · max ${w.max} · ${w.dev} · next year ${w.year}`],
    ["Dealbreaker", dealbreaker],
    ["Ideal pitch", w.pitch + (w.secondaries?.length ? ` (also cares about ${w.secondaries.join(", ")})` : "")],
    ["Home state · prestige floor", `${w.homeState} · ${w.floor}`],
    ["Teams passing both sides", n(w.eligible)]
  ]);
  // Top 25 (first 10 = Top 10 preview), plus his old team if it ranks lower.
  const rows = w.teams.map((t, i) => ({ ...t, place: i + 1 })).filter(t => t.place <= 25 || t.oldTeam);
  const role = t => `${t.stopgap ? `Backup (stopgap, usual starter ≈${t.targetLevel})` : `${t.role} (#${t.rank})`}${t.pathToStart ? " · path to start" : ""}`;
  const need = t => `${t.need === "Drop-off" ? `Drop-off ${t.dropOff}` : t.need === "Weak" ? `Weak (${t.weakness} below)` : t.need === "Upgrade" ? `Upgrade +${t.upgrade}` : t.need} ×${t.needMult}`;
  const notes = t => [t.userTeam ? "your team" : "", t.joinedByPerk ? `joined by coach perk (was #${w.userRank})` : "",
    t.meets ? "" : "fails dealbreaker", t.allowed ? "" : "below prestige floor", t.wantsHim ? "" : "team not interested",
    t.levelOk ? "" : "ceiling too low", t.parts.home ? "home state" : "", t.lookalikes ? `${t.lookalikes} lookalike${t.lookalikes > 1 ? "s" : ""} coming in` : "", t.oldTeam ? "old team" : "", t.serviceAcademy ? "service academy" : ""].filter(Boolean).join(", ");
  $("pTop").replaceChildren(
    el("h2", { textContent: `Top 10 preview (★) and next 15 · click a team for his role there` }),
    grid([
      { h: "#", v: t => t.place, num: true }, { h: "★", v: t => t.place <= w.top10.length ? "★" : "", cls: "star" },
      { h: "Team", v: t => t.team }, { h: "Prestige", v: t => t.prestigeLevel, num: true },
      { h: "Dealbreaker", v: t => grade(t.dealbreakerGrade) }, { h: "Pitch Grades", v: t => (t.pitchGrades || []).map(grade).join(" / ") || "–" },
      { h: "Combined", v: t => t.combined, num: true, tip: "Half player score, half team score" },
      { h: "Player", v: t => t.playerScore, num: true, tip: "Player score" }, { h: "Team", v: t => t.score, num: true, tip: "Team score" },
      { h: "His Role", v: role }, { h: "Need in Room", v: need }, { h: "Notes", v: notes, cls: "note" }
    ], rows, { onClick: t => showRoleAt(t.teamIndex) }));
}

async function showRoleAt(teamIndex) {
  const r = await call("roleAt", S.picked, teamIndex);
  if (!r) return;
  const ahead = r.ahead.length ? ` Ahead of him: ${r.ahead.map(a => `${a.name} ${a.overall} (${a.year})`).join(", ")}.` : "";
  const go = el("button", { textContent: `${r.team} depth chart →` });
  go.addEventListener("click", () => { S.teamIndex = teamIndex; showView("teams"); });
  $("pRole").replaceChildren(
    el("span", { className: `role-${r.role}`, textContent: `At ${r.team}: ${r.role} (#${r.rank} ${r.room}, ${r.starters} starter${r.starters === 1 ? "" : "s"})${r.pathToStart ? ", path to start the year after" : ""}.` }),
    `${ahead} `, go);
}

// ---------- teams ----------
async function loadTeams() {
  if (!S.teams) {
    const [rows, dt] = await busy("Projecting every depth chart…", () => Promise.all([call("leagueSummary"), call("depthTeams")]));
    if (!rows || !dt) return;
    S.teams = rows; S.projects = dt.projects;
    if (S.teamIndex === null) S.teamIndex = rows[0]?.teamIndex ?? null;
  }
  renderTeamList();
  if (S.teamIndex !== null) await showTeam(S.teamIndex);
}

function renderTeamList() {
  const q = $("tFilter").value.trim().toLowerCase();
  const rows = S.teams.filter(t => !q || t.team.toLowerCase().includes(q));
  $("tList").replaceChildren(grid([
    { h: "Team", v: t => t.team }, { h: "Open", v: t => t.openSlots, num: true, cls: t => t.openSlots ? "out" : "" },
    { h: "Lost", v: t => t.startersLost, num: true, tip: "This season's starters who won't be back" },
    { h: "Replaced", v: t => t.startersFilled, num: true, tip: "Lost starters replaced by incoming players who project to start" },
    { h: "Roster", v: t => t.rosterNextSeason, num: true, tip: "Players next season" }
  ], rows, { onClick: t => showTeam(t.teamIndex), selected: t => t.teamIndex === S.teamIndex }));
}
$("tFilter").addEventListener("input", renderTeamList);

async function showTeam(teamIndex) {
  S.teamIndex = Number(teamIndex);
  renderTeamList();
  const t = await call("depthTeam", teamIndex);
  if (!t) return;
  $("tTitle").textContent = t.team;
  $("tInfo").textContent = `${t.offScheme.replace(/^OFF_/, "")} / ${t.defScheme.replace(/^DEF_/, "")} · ${t.rosterNextSeason} players next season · ` +
    (S.projects ? "projected next season (minus graduating, early-draft and portal players; plus committed transfers and recruits)" : "rosters as they are now");
  $("tNeed").textContent = `Starters lost ${t.startersLost} · replaced by incoming ${t.startersFilled} · open ${t.openSlots}`;
  $("tNeed").className = t.openSlots ? "warn" : "";
  $("tRole").replaceChildren();
  if (S.picked !== null) {
    const r = await call("roleAt", S.picked, teamIndex);
    if (r) $("tRole").replaceChildren(el("span", { className: `role-${r.role}`, textContent: `${S.pickedName} here: ${r.role} (#${r.rank} ${r.room})${r.pathToStart ? ", path to start" : ""}` }));
  }
  const rooms = t.roomOrder.filter(r => (t.starters[r] ?? 0) > 0 || t.rooms[r].length);
  $("tRooms").replaceChildren(...rooms.map(room => {
    const need = t.needs[room], list = t.rooms[room], starters = t.starters[room] ?? 0;
    const rows = list.map(e => el("tr", {},
      el("td", { className: `role-${e.role}`, textContent: e.role }), el("td", { textContent: e.name }), el("td", { textContent: e.position }),
      el("td", { className: "num", textContent: e.overall }), el("td", { className: "num max", textContent: e.max, title: "Max overall" }),
      el("td", { textContent: e.year }), el("td", { className: "note", textContent: [...e.tags, e.pathToStart ? "Path to start" : null].filter(Boolean).join(" · ") })));
    return el("div", { className: "room" },
      el("h3", {}, room, el("span", { textContent: `${starters} starter${starters === 1 ? "" : "s"} · ${list.length} players` })),
      el("table", { className: "grid" }, ...rows),
      need?.lost.length ? el("div", { className: "lost", textContent: `Lost: ${need.lost.map(l => `${l.name} ${l.overall} (${l.reason})`).join(", ")}` }) : null,
      need?.filledByIncoming.length ? el("div", { className: "filled", textContent: `Replaced by: ${need.filledByIncoming.map(f => `${f.name} ${f.overall}`).join(", ")}` }) : null);
  }));
}

// ---------- signing day (preview only): overview tiles → transfers, schools, one school, cuts, cleanup ----------
const SD = { page: "home", teamIndex: null, back: "schools", schoolSort: { key: "avgIn", desc: true }, filter: { pos: "", stars: "", q: "", cutKind: "real" } };
const starText = s => s ? "★".repeat(s) : "–";
const yr = y => ({ Freshman: "Fr", Sophomore: "So", Junior: "Jr", Senior: "Sr" })[y] ?? y;
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : "–";

async function loadSigning() {
  if (!S.signing) {
    Object.assign(SD, { page: "home", teamIndex: null, tab: 0 });
    const plan = await busy("Building the Signing Day preview…", () => call("signingDayPlan"));
    if (!plan) return;
    if (plan.available) {
      const cleanupBy = new Map(plan.teams.map(t => [t.teamIndex, t]));
      plan.rows = plan.placement.teams.map(t => {
        const c = cleanupBy.get(t.teamIndex);
        // Transfers in = game commits + transfers placed by the tool (cut players moved here are counted apart).
        const tin = t.placed.filter(e => e.how !== "Cut elsewhere");
        const best = [...tin].sort((a, b) => b.overall - a.overall)[0] || null;
        const avgIn = tin.length ? Math.round(tin.reduce((a, e) => a + e.overall, 0) / tin.length * 10) / 10 : 0;
        return { ...c, ...t, best, avgIn, inCount: tin.length, movedIn: t.placed.length - tin.length,
          gameIn: tin.filter(e => e.how === "Committed").length, realCuts: t.cuts.filter(e => e.kind !== "Recruit").length,
          topIn: tin.filter(e => (e.stars ?? 0) >= 4).length };
      });
      plan.allIn = [...plan.placement.placed, ...plan.placement.committed];
    }
    S.signing = plan;
  }
  renderSigning();
}

function sdGo(page, teamIndex = null) {
  if (page === "school") { SD.back = SD.page === "school" ? SD.back : SD.page; SD.teamIndex = teamIndex; }
  SD.page = page;
  renderSigning();
  window.scrollTo(0, 0);
}

function crumbs(...parts) {
  return el("div", { className: "crumbs" }, ...parts.flatMap((p, i) => {
    const node = p.go ? el("button", { className: "link", textContent: p.label }) : el("span", { textContent: p.label });
    if (p.go) node.addEventListener("click", p.go);
    return i ? [el("span", { className: "muted", textContent: " › " }), node] : [node];
  }));
}

function tile(big, label, sub, go, cls = "") {
  const t = el("div", { className: `tile ${go ? "click" : ""} ${cls}`.trim() },
    el("div", { className: "label", textContent: label }), el("div", { className: "big", textContent: big }), el("div", { className: "sub", textContent: sub }));
  if (go) t.addEventListener("click", go);
  return t;
}

function card(title, link, ...body) {
  const head = el("div", { className: "card-head" }, el("h2", { textContent: title }));
  if (link) { const b = el("button", { className: "link", textContent: link.label }); b.addEventListener("click", link.go); head.append(b); }
  return el("div", { className: "card" }, head, ...body);
}

function renderSigning() {
  const p = S.signing, box = $("sdBox");
  if (!p.available) {
    box.replaceChildren(el("p", { className: "muted", textContent: `The Signing Day preview only runs at Signing Day. This save is at ${p.stage}.` }));
    return;
  }
  const pages = { home: sdHome, transfers: sdTransfers, schools: sdSchools, school: sdSchool, cuts: sdCuts, cleanup: sdCleanup };
  box.replaceChildren(...pages[SD.page](p));
}

const home = { label: "Signing Day", go: () => sdGo("home") };

// Columns shared by the transfer tables.
const RANK_COLS = [
  { h: "Rank", v: e => e.nationalRank ?? "–", num: true, tip: "The game's national transfer ranking" },
  { h: "Pos Rank", v: e => e.positionRank ?? "–", num: true },
  { h: "Stars", v: e => starText(e.stars), cls: "stars" }
];
const PLAYER_COLS = [
  { h: "Player", v: e => e.name }, { h: "Pos", v: e => e.position },
  { h: "OVR", v: e => e.overall, num: true }, { h: "Max", v: e => e.max, num: true, cls: "max" }, { h: "Yr", v: e => yr(e.year) }
];
const badge = (text, kind) => el("span", { className: `badge ${kind}`, textContent: text });
const roleCol = { h: "Role", v: e => e.role ? `${e.role} (#${e.rank})` : "–", cls: e => `role-${e.role}` };
const pickCol = { h: "Pick", v: e => e.how, tip: "Where the school was on his Top 10 when he signed",
  node: e => e.how === "Committed" ? badge("In-game", "muted") : e.how === "Top 10 #1" ? badge("#1", "good") : e.how.startsWith("Top 10") ? badge(e.how.replace("Top 10 ", ""), "info") : badge(e.how === "Best fit" ? "Best fit" : "Moved", "warn") };
const thenCol = { h: "Then", v: e => e.fate,
  node: e => e.fate === "Deleted" ? badge("Deleted", "bad") : e.fate === "Un-signed" ? badge("Un-signed", "muted")
    : el("span", {}, badge("Moved", "good"), ` ${e.fate.replace(/^Moved → /, "")}`) };

function sdHome(p) {
  const P = p.placement, top = p.allIn.filter(e => e.how.startsWith("Top 10")), first = top.filter(e => e.how === "Top 10 #1");
  const real = P.cuts.filter(e => e.kind !== "Recruit"), ends = P.teams.map(t => t.rosterEnd);
  const bestHaul = [...p.rows].filter(t => t.inCount >= 5).sort((a, b) => b.avgIn - a.avgIn)[0];
  const ranked = [...p.allIn].sort((a, b) => (a.nationalRank ?? 1e9) - (b.nationalRank ?? 1e9));
  return [
    el("p", { className: "muted", textContent: `Preview only: nothing is written. ${p.userTeam} is never changed. Click a tile to see the details.` }),
    el("div", { className: "tiles" },
      tile(n(P.placed.length), "Transfers placed", `${n(first.length)} at their #1 (${pct(first.length, P.placed.length)}) · ${n(P.unplaced.length)} left over`, () => sdGo("transfers")),
      tile(String(p.rows.length), "Schools", bestHaul ? `Best haul: ${bestHaul.team}, ${bestHaul.inCount} in at ${bestHaul.avgIn.toFixed(1)} avg` : "", () => sdGo("schools")),
      tile(n(real.length), "Real players cut", `${n(real.filter(e => e.fate.startsWith("Moved")).length)} moved to another school · ${n(real.filter(e => e.fate === "Deleted").length)} deleted`, () => sdGo("cuts")),
      tile(n(p.unsign.length + P.cuts.length - real.length), "Recruits un-signed", `${n(p.unsign.length)} under ${p.underOverall} · ${n(P.cuts.length - real.length)} to make room · ${n(p.kept.length)} kept`, () => sdGo("cleanup")),
      tile(`${Math.min(...ends)}–${Math.max(...ends)}`, "Rosters after", `${P.over.length} over ${P.rosterMax} · ${ends.filter(x => x < 75).length} under 75`,
        () => { SD.schoolSort = { key: "rosterEnd", desc: false }; sdGo("schools"); }, P.over.length ? "bad" : "")),
    el("div", { className: "cards2" },
      card("Top transfers", { label: "See all →", go: () => sdGo("transfers") },
        grid([...RANK_COLS.slice(0, 1), RANK_COLS[2], PLAYER_COLS[0], PLAYER_COLS[1], PLAYER_COLS[2], { h: "To", v: e => e.team }, pickCol],
          ranked.slice(0, 12), { onClick: e => S.signing.rows.some(t => t.teamIndex === e.teamIndex) && sdGo("school", e.teamIndex) })),
      card("Best transfer classes", { label: "See all →", go: () => sdGo("schools") },
        grid([{ h: "School", v: t => t.team }, { h: "In", v: t => t.inCount, num: true }, { h: "Avg OVR In", v: t => t.avgIn.toFixed(1), num: true },
          { h: "Best In", v: t => t.best ? `${t.best.name} ${t.best.position} ${t.best.overall}` : "" }],
          [...p.rows].filter(t => t.inCount >= 5).sort((a, b) => b.avgIn - a.avgIn).slice(0, 12), { onClick: t => sdGo("school", t.teamIndex) })))
  ];
}

function sdTransfers(p) {
  const f = SD.filter, q = f.q.trim().toLowerCase();
  const rows = [...p.allIn].filter(e => (!f.pos || roomOfPos(e.position) === f.pos) && (!f.stars || String(e.stars) === f.stars) &&
    (!q || `${e.name} ${e.from} ${e.team}`.toLowerCase().includes(q))).sort((a, b) => (a.nationalRank ?? 1e9) - (b.nationalRank ?? 1e9));
  const pos = el("select", {}, el("option", { value: "", textContent: "All positions" }), ...ROOMS_UI.map(r => el("option", { value: r, textContent: r })));
  pos.value = f.pos; pos.addEventListener("change", () => { f.pos = pos.value; renderSigning(); });
  const stars = el("select", {}, el("option", { value: "", textContent: "All stars" }), ...[5, 4, 3, 2, 1].map(s => el("option", { value: String(s), textContent: `${s} stars` })));
  stars.value = f.stars; stars.addEventListener("change", () => { f.stars = stars.value; renderSigning(); });
  const search = el("input", { placeholder: "Player, from or to school", value: f.q });
  search.addEventListener("change", () => { f.q = search.value; renderSigning(); });
  return [
    crumbs(home, { label: "Transfers" }),
    el("div", { className: "row filters" }, search, pos, stars, el("span", { className: "muted", textContent: `${n(rows.length)} transfers · click a row for his new school` })),
    el("div", { className: "card" }, grid([...RANK_COLS, ...PLAYER_COLS, { h: "From", v: e => e.from }, { h: "To", v: e => e.team }, pickCol, roleCol], rows, { onClick: e => S.signing.rows.some(t => t.teamIndex === e.teamIndex) && sdGo("school", e.teamIndex) }))
  ];
}

const SCHOOL_COLS = [
  { key: "team", h: "School", v: t => t.team },
  { key: "prestige", h: "Prestige", v: t => t.prestige, num: true },
  { key: "inCount", h: "Transfers In", v: t => t.inCount, num: true },
  { key: "avgIn", h: "Avg OVR In", v: t => t.avgIn ? t.avgIn.toFixed(1) : "–", num: true, sortValue: t => t.avgIn },
  { key: "topIn", h: "4–5★ In", v: t => t.topIn, num: true, cls: "stars" },
  { key: "bestOvr", h: "Best In", v: t => t.best ? `${t.best.name} ${t.best.position} ${t.best.overall}` : "" },
  { key: "realCuts", h: "Real Players Cut", v: t => t.realCuts, num: true, cls: t => t.realCuts ? "out" : "" },
  { key: "rosterEnd", h: "Roster", v: t => t.rosterEnd, num: true, tip: "Next season's roster after everything" },
  { key: "board", h: "Board", v: t => t.board, num: true, tip: "Committed-players board slots used (35 per school)" }
];

function sdSchools(p) {
  return [
    crumbs(home, { label: "Schools" }),
    el("p", { className: "muted", textContent: "Click a heading to sort; click a school for everything it did." }),
    el("div", { className: "card" }, grid(SCHOOL_COLS, sortBy(p.rows, SCHOOL_COLS, SD.schoolSort), {
      sort: SD.schoolSort,
      onSort: c => { SD.schoolSort = { key: c.key, desc: c.key === SD.schoolSort.key ? !SD.schoolSort.desc : !!c.num }; renderSigning(); },
      onClick: t => sdGo("school", t.teamIndex)
    }))
  ];
}

function sdSchool(p) {
  const t = p.rows.find(x => x.teamIndex === SD.teamIndex);
  const real = t.cuts.filter(e => e.kind !== "Recruit"), recruitsCut = t.cuts.length - real.length;
  const starters = t.placed.filter(e => e.how !== "Cut elsewhere" && e.role === "Starter").length;
  const moved = real.filter(e => e.fate.startsWith("Moved")).length;
  const sentences = [
    t.inCount ? `${t.team} gets ${t.inCount} transfer${t.inCount === 1 ? "" : "s"} averaging ${t.avgIn.toFixed(1)} OVR (${t.gameIn} committed in-game, ${t.inCount - t.gameIn} placed by the tool); ${starters} of them start. Best: ${t.best.name} (${t.best.position} ${t.best.overall}).` : `${t.team} gets no transfers.`,
    t.movedIn ? `${t.movedIn} player${t.movedIn === 1 ? "" : "s"} cut elsewhere move${t.movedIn === 1 ? "s" : ""} here.` : null,
    t.unsign.length || recruitsCut ? `${t.unsign.length + recruitsCut} signed recruit${t.unsign.length + recruitsCut === 1 ? " is" : "s are"} un-signed (${t.unsign.length} under ${p.underOverall}, ${recruitsCut} to make room); ${t.kept.length} kept under ${p.underOverall} for their ceiling.` : "No recruits are un-signed.",
    real.length ? `${real.length} bench player${real.length === 1 ? " is" : "s are"} cut to make room: ${moved} move${moved === 1 ? "s" : ""} to another school, ${real.length - moved} ${real.length - moved === 1 ? "is" : "are"} deleted.` : "No real players are cut.",
    `Roster goes from ${t.rosterStart} to ${t.rosterEnd}.`
  ];
  const cleanupCols = [...PLAYER_COLS.slice(0, 4), { h: "Dev", v: e => e.dev }, { h: "Type", v: e => e.recruitClass.startsWith("JuniorCollege") ? "JUCO" : "HS" },
    { h: "Avg Starter", v: e => e.avgStarter ?? "–", num: true, tip: "League average next-season starter at his position" }];
  const backLabel = { schools: "Schools", transfers: "Transfers", cuts: "Cuts", cleanup: "Recruit cleanup", home: null }[SD.back];
  return [
    crumbs(home, ...(backLabel ? [{ label: backLabel, go: () => sdGo(SD.back) }] : []), { label: t.team }),
    el("div", { className: "tiles small" },
      tile(`${t.rosterStart} → ${t.rosterEnd}`, "Roster", `prestige ${t.prestige}`),
      tile(String(t.inCount), "Transfers in", t.inCount ? `avg OVR ${t.avgIn.toFixed(1)} · ${t.topIn} rated 4–5★` : "none"),
      tile(String(real.length), "Real players cut", real.length ? `${moved} moved · ${real.length - moved} deleted` : "none"),
      tile(String(t.unsign.length + recruitsCut), "Recruits un-signed", `${t.kept.length} kept under ${p.underOverall}`),
      tile(`${t.board} / ${p.boardSlots}`, "Board", "committed-players slots used")),
    el("div", { className: "card summary" }, ...sentences.filter(Boolean).map(s => el("p", { textContent: s }))),
    schoolTabs([
      [`Transfers In (${t.inCount}${t.movedIn ? ` + ${t.movedIn} moved` : ""})`, () => t.placed.length ? grid([...RANK_COLS, ...PLAYER_COLS, { h: "From", v: e => e.from }, pickCol, roleCol, { h: "Cut for Him", v: e => e.cut || "", cls: "note" }],
        [...t.placed].sort((a, b) => b.overall - a.overall)) : none()],
      [`Cut to Make Room (${t.cuts.length})`, () => t.cuts.length ? grid([...PLAYER_COLS, { h: "Type", v: e => e.kind }, { h: "Role Once He Arrives", v: e => e.role ?? "", cls: e => `role-${e.role}` },
        { h: "Why", v: e => e.forName ? `${e.reason}: ${e.forName}` : e.reason, cls: "note" }, thenCol],
        [...t.cuts].sort((a, b) => b.overall - a.overall)) : none()],
      [`Recruit Cleanup (${t.unsign.length} un-signed, ${t.kept.length} kept)`, () => el("div", {},
        el("h3", { textContent: `Un-signed: under ${p.underOverall} (${t.unsign.length})` }),
        t.unsign.length ? grid(cleanupCols, [...t.unsign].sort((a, b) => b.overall - a.overall)) : none(),
        el("h3", { textContent: `Kept under ${p.underOverall} for their ceiling (${t.kept.length})` }),
        t.kept.length ? grid(cleanupCols, t.kept) : none())]
    ])
  ];
}

const none = () => el("p", { className: "muted", textContent: "None." });

// Tabs inside a card; remembers the open tab across schools.
function schoolTabs(tabs) {
  const body = el("div", { className: "tab-body" });
  const bar = el("div", { className: "tabbar" });
  const show = i => {
    SD.tab = i;
    [...bar.children].forEach((b, j) => b.classList.toggle("active", j === i));
    body.replaceChildren(tabs[i][1]());
  };
  tabs.forEach(([label], i) => { const b = el("button", { textContent: label }); b.addEventListener("click", () => show(i)); bar.append(b); });
  const c = el("div", { className: "card" }, bar, body);
  show(Math.min(SD.tab ?? 0, tabs.length - 1));
  return c;
}

function sdCuts(p) {
  const f = SD.filter;
  const rows = p.placement.cuts.filter(e => f.cutKind === "all" || (f.cutKind === "real") === (e.kind !== "Recruit")).sort((a, b) => b.overall - a.overall);
  const kind = el("select", {}, ...[["real", "Real players"], ["recruit", "Recruits"], ["all", "Everyone"]].map(([v, l]) => el("option", { value: v, textContent: l })));
  kind.value = f.cutKind; kind.addEventListener("change", () => { f.cutKind = kind.value; renderSigning(); });
  return [
    crumbs(home, { label: "Cuts" }),
    el("div", { className: "row filters" }, kind, el("span", { className: "muted", textContent: `${n(rows.length)} cut · only bench players once the newcomer arrives, at most ${p.placement.maxRealCuts} real players per school · click a row for the school` })),
    el("div", { className: "card" }, grid([...PLAYER_COLS, { h: "Type", v: e => e.kind }, { h: "School", v: e => e.team }, { h: "Why", v: e => e.forName ? `${e.reason}: ${e.forName}` : e.reason, cls: "note" }, thenCol],
      rows, { onClick: e => sdGo("school", e.teamIndex) }))
  ];
}

function sdCleanup(p) {
  const byDev = list => Object.entries(list.reduce((m, e) => ({ ...m, [e.dev]: (m[e.dev] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${n(v)}`).join(", ");
  const signed = p.teams.reduce((a, t) => a + t.signed, 0);
  return [
    crumbs(home, { label: "Recruit cleanup" }),
    el("div", { className: "card summary" },
      el("p", { textContent: `CPU schools signed ${n(signed)} HS/JUCO recruits; ${n(p.unsign.length + p.kept.length)} are under ${p.underOverall} OVR.` }),
      el("p", { textContent: `${n(p.unsign.length)} are un-signed (${byDev(p.unsign)}). ${n(p.kept.length)} are kept (${byDev(p.kept)}): ${p.keepDev.join("/")} recruits whose max reaches the average starter at their position.` })),
    el("div", { className: "card" }, grid([{ h: "School", v: t => t.team }, { h: "Signed", v: t => t.signed, num: true }, { h: "Un-Signed", v: t => t.unsign.length, num: true, cls: "out" },
      { h: `Kept Under ${p.underOverall}`, v: t => t.kept.length, num: true, cls: "kept" }],
      [...p.rows].sort((a, b) => b.unsign.length - a.unsign.length || a.team.localeCompare(b.team)), { onClick: t => sdGo("school", t.teamIndex) }))
  ];
}

const ROOMS_UI = ["QB", "HB", "FB", "WR", "TE", "OT", "OG", "C", "EDGE", "DT", "LB", "CB", "S", "K", "P"];
const POS_ROOM = { LT: "OT", RT: "OT", LG: "OG", RG: "OG", LE: "EDGE", RE: "EDGE", NT: "DT", LOLB: "LB", MLB: "LB", ROLB: "LB", FS: "S", SS: "S" };
const roomOfPos = pos => POS_ROOM[pos] ?? pos;

// ---------- launch: offer the last save ----------
(async () => {
  const last = await call("lastSave");
  if (last?.exists) {
    $("reopenBtn").hidden = false;
    $("reopenBtn").dataset.path = last.path;
    $("reopenBtn").textContent = `Reopen ${last.path.split(/[\\/]/).pop()}`;
  }
})();
