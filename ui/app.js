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
  school: null,      // school shown on the Signing Day view
  sdSort: { key: "unsign", desc: true },
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
    const tr = el("tr", {}, ...cols.map(c => el("td", {
      textContent: c.v(r) ?? "",
      className: [c.num ? "num" : "", typeof c.cls === "function" ? c.cls(r) : c.cls || ""].join(" ").trim()
    })));
    if (onClick) { tr.classList.add("click"); tr.addEventListener("click", () => onClick(r)); }
    if (selected && selected(r)) tr.classList.add("sel");
    return tr;
  });
  return el("table", { className: "grid" }, head, ...body);
}

function sortBy(rows, cols, sort) {
  const c = cols.find(x => x.key === sort.key);
  return [...rows].sort((a, b) => {
    const va = c.v(a), vb = c.v(b);
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
  Object.assign(S, { info, portal: null, picked: null, pickedName: "", teams: null, teamIndex: info.userTeam?.teamIndex ?? null, signing: null, school: null, pending: [] });
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
    t.levelOk ? "" : "ceiling too low", t.parts.home ? "home state" : "", t.oldTeam ? "old team" : "", t.serviceAcademy ? "service academy" : ""].filter(Boolean).join(", ");
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

// ---------- signing day ----------
const SD_COLS = [
  { key: "team", h: "School", v: t => t.team },
  { key: "signed", h: "Signed", v: t => t.signed, num: true },
  { key: "unsign", h: "Un-Signed", v: t => t.unsign.length, num: true, cls: "out" },
  { key: "kept", h: "Kept Under 60", v: t => t.kept.length, num: true, cls: "kept" },
  { key: "boardBefore", h: "Board Now", v: t => t.boardBefore, num: true },
  { key: "boardAfter", h: "Board After", v: t => t.boardAfter, num: true },
  { key: "boardFree", h: "Free", v: t => t.boardFree, num: true, cls: "free" }
];

async function loadSigning() {
  if (!S.signing) {
    const plan = await busy("Building the Signing Day preview…", () => call("signingDayPlan"));
    if (!plan) return;
    S.signing = plan;
  }
  const p = S.signing;
  if (!p.available) {
    $("sNote").textContent = `The recruit cleanup only runs at Signing Day. This save is at ${p.stage}.`;
    $("sSummary").replaceChildren(); $("sSchools").replaceChildren(); $("sSchool").replaceChildren();
    return;
  }
  $("sNote").textContent = `Preview only: nothing is written. ${p.userTeam} is never changed. Click a school for its recruits; click a heading to sort.`;
  const byDev = list => Object.entries(list.reduce((m, e) => ({ ...m, [e.dev]: (m[e.dev] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${n(v)}`).join(", ");
  const total = p.teams.length * p.boardSlots, sum = k => p.teams.reduce((a, t) => a + t[k], 0);
  kvRows("sSummary", [
    ["Signed recruits at CPU schools", `${n(sum("signed"))} (${n(p.unsign.length + p.kept.length)} under ${p.underOverall})`],
    ["Un-signed", `${n(p.unsign.length)} (${byDev(p.unsign)})`],
    [`Kept under ${p.underOverall}`, `${n(p.kept.length)} (${byDev(p.kept)}): ${p.keepDev.join("/")} whose max reaches the average starter at his position`],
    [`Board spots free (${p.boardSlots} per school)`, `${n(total - sum("boardBefore"))} → ${n(total - sum("boardAfter"))}`],
    ["Schools with a full board", `${p.teams.filter(t => t.boardBefore >= p.boardSlots).length} → ${p.teams.filter(t => t.boardAfter >= p.boardSlots).length}`]
  ]);
  renderSchools();
  renderSchool(p.teams.find(t => t.teamIndex === S.school?.teamIndex) || sortBy(p.teams, SD_COLS, S.sdSort)[0]);
}

function renderSchools() {
  $("sSchools").replaceChildren(grid(SD_COLS, sortBy(S.signing.teams, SD_COLS, S.sdSort), {
    sort: S.sdSort,
    onSort: c => { S.sdSort = { key: c.key, desc: c.key === S.sdSort.key ? !S.sdSort.desc : !!c.num }; renderSchools(); },
    onClick: renderSchool,
    selected: t => t.teamIndex === S.school?.teamIndex
  }));
}

function renderSchool(t) {
  S.school = t;
  renderSchools();
  const p = S.signing;
  const cols = [
    { h: "Player", v: e => e.name }, { h: "Pos", v: e => e.position }, { h: "OVR", v: e => e.overall, num: true },
    { h: "Max", v: e => e.max, num: true, cls: "max" }, { h: "Dev", v: e => e.dev },
    { h: "Type", v: e => e.recruitClass.startsWith("JuniorCollege") ? "JUCO" : "HS" },
    { h: "Avg Starter", v: e => e.avgStarter ?? "–", num: true, tip: "League average next-season starter at his position" }
  ];
  $("sSchool").replaceChildren(
    el("h2", { textContent: `${t.team}: ${t.signed} signed · board ${t.boardBefore} → ${t.boardAfter} (${t.boardFree} free)` }),
    el("h2", { textContent: `Un-signed (${t.unsign.length})` }),
    grid(cols, [...t.unsign].sort((a, b) => b.overall - a.overall)),
    el("h2", { textContent: `Kept under ${p.underOverall} (${t.kept.length})` }),
    grid(cols, t.kept));
}

// ---------- launch: offer the last save ----------
(async () => {
  const last = await call("lastSave");
  if (last?.exists) {
    $("reopenBtn").hidden = false;
    $("reopenBtn").dataset.path = last.path;
    $("reopenBtn").textContent = `Reopen ${last.path.split(/[\\/]/).pop()}`;
  }
})();
