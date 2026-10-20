const $ = id => document.getElementById(id);
let busy = false;
let info = null;          // last open() result
let depthTeams = null;    // team list for the picker
let portalByLabel = new Map();
let portalLoaded = false;
let selectedPortal = null;  // player index picked on the Portal Players tab
let leagueLoaded = false;

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
  const head = el("tr", {}, ...headers.map(h => el("th", { textContent: h })));
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
  for (const t of ["stage", "players", "depth", "league"]) show(`tab-${t}`, t === tab);
  if (tab === "players") loadPortal();
  if (tab === "depth") loadDepth();
  if (tab === "league") loadLeague();
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

// Letter grades as the game shows them: "Bminus" -> "B-".
const grade = g => g ? String(g).replace("minus", "-").replace("plus", "+") : "–";
const gradeClass = g => `grade grade-${String(g || "none")[0]}`;
const words = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");
const chip = (text, cls = "", title = "") => el("span", { className: `chip ${cls}`, textContent: text, title });

async function showFit() {
  selectedPortal = portalByLabel.get($("portalInput").value) ?? null;
  show("cardBox", selectedPortal !== null);
  show("fitBox", selectedPortal !== null);
  if (selectedPortal === null) return;
  const [card, w] = await Promise.all([call("playerCard", selectedPortal), call("destinations", selectedPortal)]);
  if (card) renderCard(card);
  if (w) { renderWants(w); renderFit(w); }
}

// ---------- player card ----------
let showAllRatings = false;

function renderCard(c) {
  $("cOvr").textContent = c.overall;
  $("cMax").textContent = c.max;
  $("cName").textContent = c.name;
  $("cJersey").textContent = c.jersey ? `#${c.jersey}` : "";
  $("cSub").textContent = `${c.position} · ${c.archetype} · ${c.year}${c.redshirt === "Previous" ? " (redshirted)" : c.redshirt === "Current" ? " (redshirting)" : ""} → ${c.nextYear} next year`;
  $("cChips").replaceChildren(
    chip(`${c.dev} dev`, `dev dev-${c.dev}`),
    c.height ? chip(`${c.height}, ${c.weight} lbs`) : null,
    chip(`From ${c.fromTeam}`),
    chip([c.hometown, c.homeState].filter(Boolean).join(", ") || "Home unknown"),
    c.stars ? chip(`${c.stars}★ recruit`, "stars") : null,
    c.personality ? chip(c.personality) : null);

  const tierPill = (tier, cls = "") => el("span", { className: `tier tier-${tier} ${cls}`, textContent: tier === "None" ? "–" : tier });
  $("cPhysical").replaceChildren(el("div", { className: "muted small", textContent: "Physical (by his archetype)" }),
    ...c.physical.map(a => el("div", { className: `ability${a.tierLevel ? "" : " off"}`, title: a.description },
      tierPill(a.tier),
      el("span", { className: "aname", textContent: a.name }),
      el("span", { className: "muted small", textContent: a.nextTier
        ? `${a.nextTier} at ${a.needs.filter(n => n.value < n.needed).map(n => `${n.short} ${n.needed} (now ${n.value})`).join(" + ")}`
        : "top tier" }))));
  $("cMental").replaceChildren(el("div", { className: "muted small", textContent: "Mental" }),
    ...(c.mental.length ? c.mental.map(m => el("div", { className: "ability" }, tierPill(m.tier), el("span", { className: "aname", textContent: m.name })))
      : [el("div", { className: "muted small", textContent: "none" })]));

  $("cGroups").replaceChildren(...c.skillGroups.map(g => {
    const bar = el("div", { className: "bar", title: `Level ${g.level} of 20; his cap is ${g.cap}` },
      el("div", { className: "fill" }), el("div", { className: "capmark" }));
    bar.firstChild.style.width = `${Math.min(g.level, 20) / 20 * 100}%`;
    bar.lastChild.style.left = `${Math.min(g.cap, 20) / 20 * 100}%`;
    return el("div", { className: "group" },
      el("span", { className: "gname", textContent: g.name }), bar,
      el("span", { className: "small", textContent: `${g.level} / cap ${g.cap}${g.atCap ? " (at cap)" : ""}` }),
      el("span", { className: "small", textContent: g.target ? `${g.rating} → ${g.target}` : `${g.rating}` }));
  }));

  const ratingRow = r => el("div", { className: "rating" },
    el("span", { className: "rshort", textContent: r.short }),
    el("span", { className: "rname", textContent: r.name }),
    el("span", { className: "rval", textContent: r.value }),
    r.atCap > r.value ? el("span", { className: "rcap", textContent: `→ ${r.atCap}` }) : el("span"));
  $("cRatings").replaceChildren(...c.skillGroups.map(g =>
    el("div", { className: "rgroup" }, el("h4", { textContent: g.name }), ...g.ratings.map(ratingRow))));
  const others = c.ratings.filter(r => !r.inGroups).sort((a, b) => b.value - a.value);
  $("cOtherRatings").replaceChildren(el("div", { className: "rgroup wide" },
    el("h4", { textContent: "Other ratings (not in his skill groups)" }), el("div", { className: "rcols" }, ...others.map(ratingRow))));
  const updateToggle = () => {
    show("cOtherRatings", showAllRatings);
    $("allRatingsBtn").textContent = showAllRatings ? "Hide other ratings" : `Show all ratings (${others.length} more)`;
  };
  $("allRatingsBtn").onclick = () => { showAllRatings = !showAllRatings; updateToggle(); };
  updateToggle();
}

function renderWants(w) {
  const dropped = w.dealbreaker === "none" && w.originalDealbreaker;
  const row = (k, ...v) => el("tr", {}, el("th", { textContent: k }), el("td", {}, ...v));
  $("cWants").replaceChildren(
    row("Dealbreaker", dropped
      ? `none (${words(w.originalDealbreaker)} dropped: below his position average)`
      : `${words(w.dealbreaker)}`, !dropped && w.dealbreakerBar ? el("span", { className: "muted" }, " · needs ", chip(grade(w.dealbreakerBar), gradeClass(w.dealbreakerBar))) : null),
    row("Ideal pitch", `${w.pitch}`, w.secondaries?.length ? el("span", { className: "muted", textContent: ` · also ${w.secondaries.map(words).join(", ")}` }) : null),
    row("Home state", w.homeState || "–"),
    row("Prestige floor", w.floor),
    row("Schools", `${w.eligible} pass both sides`));
}

// ---------- Top 10 table ----------
let showMoreSchools = false;

function renderFit(w) {
  $("fitSummary").textContent = `· ${w.top10.length} schools on his list`;
  // Top 25 (first 10 = Top 10 preview), plus his old team if it ranks lower.
  const rows = w.teams.map((t, i) => ({ ...t, place: i + 1 })).filter(t => t.place <= 25 || t.oldTeam);
  const th = (text, props = {}) => el("th", { textContent: text, ...props });
  const head = el("thead", {},
    el("tr", {}, th("#", { rowSpan: 2 }), th("School", { rowSpan: 2 }), th("Prestige", { rowSpan: 2 }),
      th("Does he like them?", { colSpan: 3, className: "grp side-player" }), th("Do they want him?", { colSpan: 3, className: "grp side-team" }),
      th("Combined", { rowSpan: 2 }), th("Notes", { rowSpan: 2 })),
    el("tr", {}, th("Dealbreaker", { className: "side-player" }), th("Pitch grades", { className: "side-player" }), th("Player score", { className: "side-player" }),
      th("His role there", { className: "side-team" }), th("Need in his room", { className: "side-team" }), th("Team score", { className: "side-team" })));

  const tr = t => {
    const inTop = t.place <= w.top10.length;
    const role = t.stopgap
      ? chip("Backup · stopgap", "role-chip role-Backup", `Their usual starter is about ${t.targetLevel}`)
      : chip(`${t.role} #${t.rank}`, `role-chip role-${t.role}`);
    const need = t.need === "Drop-off" ? `Drop-off ${t.dropOff}` : t.need === "Weak" ? `Weak (${t.weakness} below)`
      : t.need === "Upgrade" ? `Upgrade +${t.upgrade} (counts +${t.weightedUpgrade})` : t.need;
    const notes = [
      t.userTeam ? chip("your team", "note-you") : null,
      t.joinedByPerk ? chip(`joined by coach perk (ranked #${w.userRank})`, "note-good") : t.userTeam && t.perkReach ? chip(`coach perk (can join from #${w.userReach})`) : null,
      t.meets ? null : chip("fails dealbreaker", "note-bad"),
      t.allowed ? null : chip("below prestige floor", "note-bad"),
      t.wantsHim ? null : chip("team not interested", "note-bad"),
      t.levelOk ? null : chip("ceiling too low", "note-bad"),
      t.parts.home ? chip("home state", "note-good") : null,
      t.oldTeam ? chip("his old team") : null,
      t.serviceAcademy ? chip("service academy") : null].filter(Boolean);
    const row = el("tr", { className: `click${inTop ? " top" : ""}${t.userTeam ? " you" : ""}` },
      el("td", { className: "num", textContent: inTop ? `${t.place} ★` : t.place }),
      el("td", { className: "team", textContent: t.team }),
      el("td", { className: "num", textContent: t.prestigeLevel }),
      el("td", { className: "side-player" }, chip(grade(t.dealbreakerGrade), t.meets ? "pass" : "fail", t.meets ? "Meets his dealbreaker" : "Below his dealbreaker grade")),
      el("td", { className: "side-player" }, ...((t.pitchGrades || []).length ? t.pitchGrades.map(g => chip(grade(g), gradeClass(g))) : ["–"])),
      el("td", { className: "num side-player", textContent: t.playerScore }),
      el("td", { className: "side-team" }, role, t.pathToStart ? chip("path to start", "note-good") : null),
      el("td", { className: "side-team" }, need, el("span", { className: "muted small", textContent: ` ×${t.needMult}` })),
      el("td", { className: "num side-team", textContent: t.score }),
      el("td", { className: "num combined", textContent: t.combined }),
      el("td", {}, ...notes));
    row.addEventListener("click", () => openTeam(t.teamIndex));
    return row;
  };
  const top = rows.filter(t => t.place <= w.top10.length), rest = rows.filter(t => t.place > w.top10.length);
  const restBody = el("tbody", { className: "rest" }, ...rest.map(tr));
  restBody.hidden = !showMoreSchools;
  $("fitTable").replaceChildren(head, el("tbody", {}, ...top.map(tr)), restBody);
  show("moreSchoolsBtn", rest.length > 0);
  const updateToggle = () => {
    restBody.hidden = !showMoreSchools;
    const last = rest.filter(t => t.place <= 25).length ? `${w.top10.length + 1}–${Math.min(25, w.teams.length)}` : "";
    $("moreSchoolsBtn").textContent = showMoreSchools ? "Hide the other schools" : `Show schools ${last}${rest.some(t => t.place > 25) ? `${last ? " and " : ""}his old team` : ""}`;
  };
  $("moreSchoolsBtn").onclick = () => { showMoreSchools = !showMoreSchools; updateToggle(); };
  updateToggle();
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

// ---------- open / save ----------
async function openPath(filePath) {
  setBusy(true);
  log(`Opening ${filePath}…`);
  const res = await window.ttt.open(filePath);
  setBusy(false);
  if (!res.ok) return log(`Open failed: ${res.error}`, "bad");
  info = res.result;
  depthTeams = null; leagueLoaded = false; portalLoaded = false; selectedPortal = null;
  $("portalInput").value = ""; $("roleResult").textContent = ""; show("fitBox", false); show("cardBox", false);
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
