const $ = id => document.getElementById(id);
let busy = false;
let info = null;          // last open() result
let depthTeams = null;    // team list for the picker
let portalByLabel = new Map();
let portalLoaded = false;
let selectedPortal = null;  // player index picked on the Portal Players tab
let leagueLoaded = false;
let signingPlan = null;     // Signing Day cleanup plan (loaded on first view)

// ---------- helpers ----------
function log(msg, cls = "") {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  $("log").prepend(line);
}

function setBusy(on) {
  busy = on;
  for (const id of ["openBtn", "saveBtn"]) $(id).disabled = on;
  document.body.style.cursor = on ? "progress" : "";
}

const show = (id, on = true) => { $(id).hidden = !on; };

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children.filter(c => c !== null && c !== undefined));
  return e;
}

function fillTable(table, headers, rows, numericCols = [], onRowClick = null) {
  const head = el("tr", {}, ...headers.map((h, i) => el("th", { textContent: h, className: numericCols.includes(i) ? "num" : "" })));
  const body = rows.map((cells, r) => {
    const tr = el("tr", {}, ...cells.map((c, i) => el("td", { textContent: c, className: numericCols.includes(i) ? "num" : "" })));
    if (onRowClick) { tr.className = "click"; tr.addEventListener("click", () => onRowClick(r)); }
    return tr;
  });
  table.replaceChildren(head, ...body);
}

async function call(name, ...args) {
  const res = await window.ttt[name](...args);
  if (!res.ok) { log(`${name} failed: ${res.error}`, "bad"); return null; }
  return res.result;
}

// ---------- tabs ----------
function showTab(tab) {
  for (const b of $("tabs").querySelectorAll("button")) b.classList.toggle("active", b.dataset.tab === tab);
  for (const t of ["stage", "players", "depth", "league", "signing"]) show(`tab-${t}`, t === tab);
  if (tab === "players") loadPortal();
  if (tab === "depth") loadDepth();
  if (tab === "league") loadLeague();
  if (tab === "signing") loadSigning();
}
$("tabs").addEventListener("click", e => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); });

// ---------- stage tab ----------
function renderStage() {
  const st = info.stage, c = info.counts, dc = info.draftCheck;
  $("headerFile").textContent = info.fileName;
  $("headerStage").textContent = st.label;
  $("headerStage").className = st.supported ? (st.unconfirmed ? "warn" : "good") : "bad";
  $("filePath").textContent = info.filePath;
  $("stage").textContent = st.label + (st.unconfirmed ? " (stage number not yet confirmed on a real Week 3 save)" : "");
  $("stage").className = $("headerStage").className;
  $("season").textContent = `${st.seasonYear ?? "?"} (dynasty year ${st.dynastyYear})`;
  if (info.userTeam) {
    $("userTeam").textContent = `${info.userTeam.name} (team ${info.userTeam.teamIndex}), ${c.userTeamRoster} on roster`;
    $("userTeam").className = "";
  } else {
    $("userTeam").textContent = `"${info.settings.userTeam}" from settings.json was not found in this save`;
    $("userTeam").className = "bad";
  }
  $("rostered").textContent = c.rostered.toLocaleString();
  $("earlyDraft").textContent = c.earlyDraft.toLocaleString();
  $("enteringPortal").textContent = c.enteringPortal.toLocaleString();
  $("portalUncommitted").textContent = c.portalUncommitted.toLocaleString();
  $("portalCommitted").textContent = c.portalCommitted.toLocaleString();
  $("recruitsCommitted").textContent = c.recruitsCommitted.toLocaleString();
  $("openMs").textContent = `${(info.openMs / 1000).toFixed(2)} s`;

  if (st.id === "players-leaving") {
    $("draftCheck").textContent = `${dc.underclassmenLeaving} (Draft Lock will keep them), plus ${dc.graduatingLeaving} graduating and ${dc.userTeamLeaving} on your team`;
    $("draftCheck").className = "";
  } else {
    $("draftCheck").textContent = dc.underclassmenLeaving === 0 ? "0" : `${dc.underclassmenLeaving}: these underclassmen will leave for the draft`;
    $("draftCheck").className = dc.underclassmenLeaving === 0 ? "good" : "bad";
  }

  show("preview", false);
  $("applyResult").textContent = "";
  renderPending([]);
  if (st.id === "players-leaving") {
    $("actionText").textContent = "Draft Lock: every early-draft declaration from a player with eligibility left is set to Staying, except your team. Preview first; nothing changes until you click Apply, and nothing is written until you click Save.";
    $("actionBtn").textContent = "Preview Draft Lock";
    $("actionBtn").disabled = false;
  } else if (st.supported) {
    $("actionText").textContent = `${st.action}: coming in build step ${st.buildStep}. The Depth Chart and League Needs tabs work at every stage.`;
    $("actionBtn").textContent = st.action;
    $("actionBtn").disabled = true;
  } else {
    $("actionText").textContent = "This save is not at a stage the tool changes. The Depth Chart tab shows rosters as they are.";
    $("actionBtn").textContent = "No action";
    $("actionBtn").disabled = true;
  }
}

function renderPending(changes) {
  $("pending").textContent = changes.length ? `Unsaved: ${changes.join("; ")}` : "";
}

function renderPreview(plan) {
  show("preview");
  $("previewSummary").textContent =
    `Will lock ${plan.toLock.length} players at ${plan.byTeam.length} teams. ` +
    `${plan.graduating.length} graduating players still leave. ` +
    `${plan.userTeam.length} on your team left as they are (${plan.userTeam.map(p => `${p.name} ${p.position} ${p.overall}`).join(", ") || "none"}). ` +
    `${plan.alsoEnteringPortal} of the locked players are also entering the portal; that is left alone.` +
    (plan.alreadyStaying.length ? ` ${plan.alreadyStaying.length} already staying.` : "");
  $("applyBtn").disabled = plan.toLock.length === 0;
  fillTable($("byTeamTable"), ["Team", "Locked"], plan.byTeam.map(t => [t.team, t.count]), [1]);
  fillTable($("playersTable"), ["Player", "Pos", "OVR", "Year", "Team", "Proj. round", "Also entering portal"],
    plan.toLock.map(p => [p.name, p.position, p.overall, `${p.schoolYear}${p.redshirtStatus === "Previous" ? " (RS)" : ""}`, p.team, p.projectedRound, p.alsoEnteringPortal ? "yes" : ""]), [2, 5]);
}

$("actionBtn").addEventListener("click", async () => {
  if (busy) return;
  const plan = await call("draftLockPreview");
  if (!plan) return;
  renderPreview(plan);
  log(`Draft Lock preview: ${plan.toLock.length} players would be locked.`);
});

$("applyBtn").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  const r = await call("draftLockApply");
  setBusy(false);
  if (!r) return;
  $("applyBtn").disabled = true;
  $("actionBtn").disabled = true;
  $("applyResult").textContent = r.verified
    ? `Applied and verified: ${r.locked.length} players now Staying. Graduating players and your team unchanged. Click Save to write it.`
    : `Applied, but verification found problems: ${r.problems.join("; ")}. Do not save; reopen the file.`;
  $("applyResult").className = r.verified ? "good" : "bad";
  if (r.verified) {
    $("draftCheck").textContent = `0 (${r.locked.length} locked by Draft Lock)`;
    $("draftCheck").className = "good";
  }
  renderPending([`Draft Lock: ${r.locked.length} players set to Staying`]);
  depthTeams = null; leagueLoaded = false;   // projections change after the lock
  log(`Draft Lock applied to ${r.locked.length} players (${r.verified ? "verified" : "VERIFY FAILED"}).`, r.verified ? "good" : "bad");
});

// ---------- depth chart tab ----------
let depthLoading = null;
function loadDepth() {
  if (!depthTeams && !depthLoading) depthLoading = fetchDepth().finally(() => { depthLoading = null; });
  return depthLoading || Promise.resolve();
}

async function fetchDepth() {
  depthTeams = await call("depthTeams");
  if (!depthTeams) return;
  $("teamSelect").replaceChildren(...depthTeams.teams.map(t => el("option", { value: t.teamIndex, textContent: t.name })));
  $("teamSelect").value = depthTeams.userTeamIndex ?? depthTeams.teams[0].teamIndex;
  $("projectionNote").textContent = depthTeams.projects
    ? `Projected next season: current roster minus graduating, early-draft and portal players, plus committed transfers and recruits. Ranked by current OVR. (${depthTeams.ms} ms for all teams)`
    : "This save is not at an offseason stage, so rosters are shown as they are now.";
  await renderTeam();
}

// Opens a team's depth chart (from the Portal Players or League Needs tab).
async function openTeam(teamIndex) {
  showTab("depth");
  await loadDepth();
  $("teamSelect").value = teamIndex;
  await renderTeam();
}

async function renderTeam() {
  const t = await call("depthTeam", $("teamSelect").value);
  if (!t) return;
  $("schemeInfo").textContent = `${t.offScheme.replace(/^OFF_/, "")} / ${t.defScheme.replace(/^DEF_/, "")} · ${t.rosterNextSeason} players next season`;
  $("needLine").textContent = `Starters lost: ${t.startersLost} · replaced by incoming: ${t.startersFilled} · open: ${t.openSlots}`;
  $("needLine").className = t.openSlots ? "warn" : "";
  const rooms = t.roomOrder.filter(r => (t.starters[r] ?? 0) > 0 || t.rooms[r].length);
  $("rooms").replaceChildren(...rooms.map(room => {
    const n = t.needs[room];
    const header = el("h3", {}, room,
      el("span", { className: "muted", textContent: `${t.starters[room] ?? 0} starter${(t.starters[room] ?? 0) === 1 ? "" : "s"} · ${t.rooms[room].length} players` }));
    const rows = t.rooms[room].map(e => el("tr", {},
      el("td", {}, el("span", { className: `role role-${e.role}`, textContent: e.role })),
      el("td", { textContent: e.name }),
      el("td", { textContent: e.position }),
      el("td", { className: "num", textContent: e.overall }),
      el("td", { className: "num max", textContent: e.max, title: "Max overall: every skill group taken to its cap" }),
      el("td", { textContent: e.year }),
      el("td", {}, el("span", { className: "tag", textContent: [...e.tags, e.pathToStart ? "Path to start" : null].filter(Boolean).join(" · ") }))));
    const lost = n && n.lost.length ? el("div", { className: "lost", textContent: `Lost: ${n.lost.map(l => `${l.name} ${l.overall} (${l.reason})`).join(", ")}` }) : null;
    const filled = n && n.filledByIncoming.length ? el("div", { className: "filled", textContent: `Replaced by: ${n.filledByIncoming.map(f => `${f.name} ${f.overall}`).join(", ")}` }) : null;
    return el("div", { className: "room" }, header, el("table", { className: "grid" }, ...rows), lost, filled);
  }));
  await showRoleAt();
}

// Role of the player picked on the Portal Players tab at the team shown here.
async function showRoleAt() {
  if (selectedPortal === null) { $("roleResult").textContent = ""; return; }
  const r = await call("roleAt", selectedPortal, $("teamSelect").value);
  if (!r) return;
  const ahead = r.ahead.length ? ` Ahead of him: ${r.ahead.map(a => `${a.name} ${a.overall} (${a.year})`).join(", ")}.` : "";
  $("roleResult").textContent = `${r.player} (${r.overall} OVR, max ${r.max}, ${r.dev}) at ${r.team}: ${r.role} (#${r.rank} ${r.room}, ${r.starters} starter${r.starters === 1 ? "" : "s"})${r.pathToStart ? ", path to start the year after" : ""}.${ahead}`;
  $("roleResult").className = `role-${r.role}`;
}

// ---------- portal players tab ----------
async function loadPortal() {
  if (portalLoaded) return;
  const players = await call("portalPlayers") || [];
  portalLoaded = true;
  portalByLabel = new Map(players.map(p => [p.label, p.index]));
  $("portalList").replaceChildren(...players.map(p => el("option", { value: p.label })));
  $("portalInput").placeholder = players.length ? `Type a name (${players.length} uncommitted transfers)…` : "No uncommitted transfers at this stage";
  $("portalInput").disabled = !players.length;
}

async function showFit() {
  selectedPortal = portalByLabel.get($("portalInput").value) ?? null;
  show("fitBox", selectedPortal !== null);
  if (selectedPortal === null) return;
  const w = await call("destinations", selectedPortal);
  if (!w) return;
  $("fitSummary").textContent = `${w.player} · ${w.position} ${w.overall} (max ${w.max}, ${w.dev}) · next year ${w.year} · dealbreaker ${w.dealbreaker === "none" && w.originalDealbreaker ? `none (Playing Time dropped: below his position average)` : w.dealbreaker}${w.dealbreaker !== "none" && w.dealbreakerBar ? ` (needs ${w.dealbreakerBar})` : ""} · pitch ${w.pitch}${w.secondaries?.length ? ` (also cares about ${w.secondaries.join(", ")})` : ""} · home ${w.homeState} · floor ${w.floor} · ${w.eligible} teams pass both sides`;
  // Top 25 (first 10 = Top 10 preview), plus his old team if it ranks lower.
  const rows = w.teams.map((t, i) => ({ ...t, place: i + 1 })).filter(t => t.place <= 25 || t.oldTeam);
  fillTable($("fitTable"), ["#", "", "Team", "Prestige", "Dealbreaker grade", "Pitch grades", "Combined", "Player score", "Team score", "His role there", "Need in room", "Notes"],
    rows.map(t => [t.place, t.place <= w.top10.length ? "★" : "", t.team, t.prestigeLevel, t.dealbreakerGrade ?? "–", (t.pitchGrades || []).join(" / ") || "–", t.combined, t.playerScore, t.score,
      `${t.stopgap ? `Backup (stopgap: their usual starter ≈${t.targetLevel})` : `${t.role} (#${t.rank})`}${t.pathToStart ? " · path to start" : ""}`,
      `${t.need === "Drop-off" ? `Drop-off ${t.dropOff}` : t.need === "Weak" ? `Weak (${t.weakness} below)` : t.need === "Upgrade" ? `Upgrade +${t.upgrade} (counts +${t.weightedUpgrade})` : t.need} (×${t.needMult})`,
      [t.userTeam ? "your team" : "", t.joinedByPerk ? `joined his list by coach perk (ranked #${w.userRank})` : t.userTeam && t.perkReach ? `coach perk (can join from #${w.userReach})` : "", t.meets ? "" : `fails dealbreaker (${t.dealbreakerGrade ?? "no"})`, t.allowed ? "" : "below prestige floor", t.wantsHim ? "" : "team not interested", t.levelOk ? "" : "ceiling too low",
        t.parts.home ? "home state" : "", t.oldTeam ? "his old team" : "", t.serviceAcademy ? "service academy" : ""].filter(Boolean).join(", ")]),
    [0, 3, 6, 7, 8],
    i => openTeam(rows[i].teamIndex));
}

$("teamSelect").addEventListener("change", renderTeam);
$("portalInput").addEventListener("change", showFit);

// ---------- league tab ----------
async function loadLeague() {
  if (leagueLoaded) return;
  const rows = await call("leagueSummary");
  if (!rows) return;
  leagueLoaded = true;
  fillTable($("leagueTable"), ["Team", "Open", "Starters lost", "Replaced", "Open rooms", "Next-season roster", "Offense", "Defense"],
    rows.map(r => [r.team, r.openSlots, r.startersLost, r.startersFilled, r.openRooms.join(", "), r.rosterNextSeason, r.offScheme.replace(/^OFF_/, ""), r.defScheme.replace(/^DEF_/, "")]),
    [1, 2, 3, 5],
    i => openTeam(rows[i].teamIndex));
}

// ---------- signing day tab (step 5 preview, read-only) ----------
let sdSort = { key: "unsign", desc: true };
const SD_COLS = [
  { key: "team", label: "School", value: t => t.team },
  { key: "signed", label: "Signed recruits", value: t => t.signed, num: true },
  { key: "unsign", label: "Un-signed", value: t => t.unsign.length, num: true, cls: "count-out" },
  { key: "kept", label: "Kept under 60", value: t => t.kept.length, num: true, cls: "count-kept" },
  { key: "boardBefore", label: "Board now", value: t => t.boardBefore, num: true },
  { key: "boardAfter", label: "Board after", value: t => t.boardAfter, num: true },
  { key: "boardFree", label: "Free spots", value: t => t.boardFree, num: true, cls: "count-free" }
];

async function loadSigning() {
  if (signingPlan) return;
  const plan = await call("signingDayPlan");
  if (!plan) return;
  signingPlan = plan;
  show("sdBody", plan.available);
  if (!plan.available) {
    $("sdNote").textContent = `The recruit cleanup only runs at Signing Day. This save is at ${plan.stage}.`;
    return;
  }
  $("sdNote").textContent = `Preview only: nothing changes until a later step adds Apply and you click Save. ${plan.userTeam} is never changed.`;
  renderSigningSummary();
  renderSigningSchools();
  show("sdSchool", false);
  log(`Signing Day preview: ${plan.unsign.length} recruits to un-sign at ${plan.teams.length} schools (${plan.ms} ms).`);
}

function renderSigningSummary() {
  const p = signingPlan, n = x => x.toLocaleString();
  const byDev = list => Object.entries(list.reduce((m, e) => ({ ...m, [e.dev]: (m[e.dev] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${n(v)}`).join(", ");
  const total = p.teams.length * p.boardSlots;
  const before = p.teams.reduce((a, t) => a + t.boardBefore, 0), after = p.teams.reduce((a, t) => a + t.boardAfter, 0);
  const signed = p.teams.reduce((a, t) => a + t.signed, 0);
  const row = (k, v) => el("tr", {}, el("th", { textContent: k }), el("td", { textContent: v }));
  $("sdSummary").replaceChildren(
    row("Signed recruits at CPU schools", `${n(signed)} (${n(p.unsign.length + p.kept.length)} under ${p.underOverall})`),
    row("Un-signed", `${n(p.unsign.length)} (${byDev(p.unsign)})`),
    row(`Kept under ${p.underOverall}`, `${n(p.kept.length)} (${byDev(p.kept)}): ${p.keepDev.join("/")} whose max reaches the average starter at his position`),
    row(`Board spots free (${p.boardSlots} per school)`, `${n(total - before)} → ${n(total - after)}`),
    row("Schools with a full board", `${p.teams.filter(t => t.boardBefore >= p.boardSlots).length} → ${p.teams.filter(t => t.boardAfter >= p.boardSlots).length}`));
}

function renderSigningSchools() {
  const col = SD_COLS.find(c => c.key === sdSort.key);
  const teams = [...signingPlan.teams].sort((a, b) => {
    const va = col.value(a), vb = col.value(b);
    const c = col.num ? va - vb : String(va).localeCompare(String(vb));
    return (sdSort.desc ? -c : c) || a.team.localeCompare(b.team);
  });
  const head = el("tr", {}, ...SD_COLS.map(c => {
    // The sort mark always takes the same space (before a number heading, after a text one),
    // so headings and columns never shift when the sort changes.
    const mark = el("span", { className: "sortmark", textContent: c.key === sdSort.key ? (sdSort.desc ? "▼" : "▲") : "" });
    const th = c.num ? el("th", { className: "sort num" }, mark, c.label) : el("th", { className: "sort" }, c.label, mark);
    th.addEventListener("click", () => {
      sdSort = { key: c.key, desc: c.key === sdSort.key ? !sdSort.desc : !!c.num };
      renderSigningSchools();
    });
    return th;
  }));
  const rows = teams.map(t => {
    const tr = el("tr", { className: "click" }, ...SD_COLS.map(c => el("td", { textContent: c.value(t), className: [c.num ? "num" : "", c.cls || ""].join(" ").trim() })));
    tr.addEventListener("click", () => renderSigningSchool(t));
    return tr;
  });
  $("sdSchools").replaceChildren(head, ...rows);
}

function renderSigningSchool(t) {
  const p = signingPlan;
  show("sdSchool");
  $("sdSchoolTitle").textContent = `${t.team}: ${t.signed} signed recruits · board ${t.boardBefore} → ${t.boardAfter} (${t.boardFree} free)`;
  $("sdUnsignTitle").textContent = `Un-signed (${t.unsign.length})`;
  $("sdKeptTitle").textContent = `Kept under ${p.underOverall} (${t.kept.length})`;
  const head = () => el("tr", {}, ...[["Player"], ["Pos"], ["OVR", 1], ["Max", 1], ["Dev"], ["Type"], ["Avg starter", 1]]
    .map(([h, num]) => el("th", { textContent: h, className: num ? "num" : "", title: h === "Avg starter" ? "League average next-season starter at his position" : "" })));
  const row = e => el("tr", {},
    el("td", { textContent: e.name }), el("td", { textContent: e.position }),
    el("td", { className: "num", textContent: e.overall }), el("td", { className: "num max", textContent: e.max }),
    el("td", { textContent: e.dev }), el("td", { textContent: e.recruitClass.startsWith("JuniorCollege") ? "JUCO" : "HS" }),
    el("td", { className: "num", textContent: e.avgStarter ?? "–" }));
  $("sdUnsign").replaceChildren(head(), ...[...t.unsign].sort((a, b) => b.overall - a.overall).map(row));
  $("sdKept").replaceChildren(head(), ...t.kept.map(row));
  $("sdSchool").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- open / save ----------
async function openPath(filePath) {
  setBusy(true);
  log(`Opening ${filePath}…`);
  const res = await window.ttt.open(filePath);
  setBusy(false);
  if (!res.ok) return log(`Open failed: ${res.error}`, "bad");
  info = res.result;
  depthTeams = null; leagueLoaded = false; portalLoaded = false; selectedPortal = null; signingPlan = null;
  $("portalInput").value = ""; $("roleResult").textContent = ""; show("fitBox", false);
  show("empty", false); show("tabs");
  renderStage();
  showTab("stage");
  log(`Opened in ${(info.openMs / 1000).toFixed(2)} s. Stage: ${info.stage.label}.`, info.stage.supported ? "good" : "warn");
  return info;
}

$("openBtn").addEventListener("click", async () => {
  if (busy) return;
  const picked = await call("chooseSave");
  if (picked) await openPath(picked);
});

$("saveBtn").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  log("Saving…");
  const res = await window.ttt.save();
  setBusy(false);
  if (!res.ok) return log(`Save failed: ${res.error}`, "bad");
  const r = res.result;
  renderPending([]);
  if (r.draftLockRecord) log(`Draft Lock record written: ${r.draftLockRecord}`);
  log(`Saved${r.changes.length ? ` (${r.changes.join("; ")})` : " (no changes)"} in ${(r.saveMs / 1000).toFixed(1)} s. Verified: ${r.check.stage}, ${r.check.playerCount.toLocaleString()} players. Backup: ${r.backup.backupPath}`, "good");
});
