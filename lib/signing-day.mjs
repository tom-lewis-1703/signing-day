// Step 5: Signing Day roster build (read-only plans; writing comes later).
// Pass 0 (planRecruitCleanup) then Pass B (planPlacement); the user team is never changed.
//
// Recruit cleanup (Pass 0): every signed HS/JUCO recruit at a CPU team under
// signingDay.recruitCleanup.underOverall is un-signed, unless his dev trait is in keepDev
// and his max overall reaches the league's average next-season starter at his position
// (fit.mjs starterLevels). The user team (settings.userTeam) is never changed.
// Each team's committed-players board has BOARD_SLOTS slots, so freed board slots are the
// room for transfers placed later.
import { NO_TEAM, nextClass, classRank } from "./dynasty.mjs";
import { roomOf, assignRoles } from "./depth-chart.mjs";
import { starterLevels } from "./fit.mjs";
import { destinations } from "./destinations.mjs";
import { liveLeague, addToTeam, removeFromTeam } from "./live-league.mjs";

export const BOARD_SLOTS = 35;

// locks (GUI undos, optional): keep = players never un-signed or cut; notAt = schools a transfer is never placed at.
export function planRecruitCleanup(d, league, settings, locks = null) {
  const rc = settings.signingDay.recruitCleanup;
  const userTeam = d.findTeamByName(settings.userTeam)?.index ?? null;
  const avgStarter = starterLevels(league).leagueRoom;
  const boardUsed = new Map();
  for (const t of d.boardTeamByPlayerRef.values()) boardUsed.set(t, (boardUsed.get(t) || 0) + 1);

  const unsign = [], kept = [];
  const byTeam = new Map();
  for (const t of d.teams.values()) {
    if (t.index === userTeam) continue;
    byTeam.set(t.index, { teamIndex: t.index, team: t.name, signed: 0, unsign: [], kept: [], boardBefore: boardUsed.get(t.index) || 0, boardFreed: 0 });
  }
  for (const p of d.players) {
    if (!p.isIncomingRecruit || p.destination === null || p.destination === NO_TEAM) continue;
    const team = byTeam.get(p.destination);
    if (!team) continue;   // the user team
    team.signed++;
    if (p.overall >= rc.underOverall || locks?.keep.has(p.index)) continue;
    const room = roomOf(p.position);
    const dev = p.dev.replace("College_", "");
    const max = d.maxOverall(p);
    const avg = avgStarter[room] ?? null;
    const e = { index: p.index, name: p.name, position: p.position, room, overall: p.overall, max, dev,
      recruitClass: p.recruitClass, team: team.team, teamIndex: team.teamIndex, avgStarter: avg === null ? null : Math.round(avg * 10) / 10,
      onBoard: d.boardTeamByPlayerRef.get(p.ref) === team.teamIndex };
    if (rc.keepDev.includes(dev) && avg !== null && max >= avg) { kept.push(e); team.kept.push(e); }
    else { unsign.push(e); team.unsign.push(e); if (e.onBoard) team.boardFreed++; }
  }
  const teams = [...byTeam.values()].map(t => ({ ...t, boardAfter: t.boardBefore - t.boardFreed, boardFree: BOARD_SLOTS - (t.boardBefore - t.boardFreed) }));
  return { unsign, kept, teams, avgStarter, underOverall: rc.underOverall, keepDev: rc.keepDev };
}

// ---- Pass B: place the uncommitted transfers (settings.signingDay.placement) ----
// Works on a live copy of the projection (live-league.mjs): after every signing or cut the
// school's needs are recomputed, so each later player's Top 10 sees the new rosters
// (a filled room stops pulling; lookalikes lower interest, fit.mjs).

const OL_ROOMS = ["OT", "OG", "C"];

// Keep value (Tom): OVR + (max − OVR) × next season's year factor. Young players with a
// ceiling outlast topped-out upperclassmen.
export const keepValue = (d, p, pl) => Math.round((p.overall + (d.maxOverall(p) - p.overall) * (pl.yearFactor[nextClass(p)] ?? 0)) * 10) / 10;

// Real players never cut or left unplaced: Jr/Sr 77+, or Fr/So 72+ with max 77+ (year as shown at Signing Day).
export function isProtected(d, p, pl) {
  if (p.isIncomingRecruit) return false;
  const pr = pl.protect;
  if (p.schoolYear === "Junior" || p.schoolYear === "Senior") return p.overall >= pr.upperMinOverall;
  return p.overall >= pr.underMinOverall && d.maxOverall(p) >= pr.underMinMax;
}

const kindOf = p => p.isIncomingRecruit ? "Recruit" : p.isTransfer ? "Transfer" : "Returning";

// A newcomer's depth-chart entry; the tag marks him as incoming (needs, lookalikes).
export function meFor(d, p, pl, fromTeam) {
  const year = nextClass(p);
  return { index: p.index, name: p.name, position: p.position, overall: p.overall, dev: p.dev, year, classRank: classRank(year), finalYear: year === "Senior",
    tags: [`Transfer from ${d.teamName(fromTeam)}`], kind: "Placed", kv: keepValue(d, p, pl), cuttable: false, onBoard: true };
}

// Roles in his room (and the OL rooms) once he arrives: Map index -> entry, plus his own spot.
function rolesWith(proj, room, me, roles) {
  const byRoom = { [room]: [...proj.rooms[room], me].map(e => ({ ...e })) };
  if (OL_ROOMS.includes(room)) for (const r of OL_ROOMS) if (r !== room) byRoom[r] = proj.rooms[r].map(e => ({ ...e }));
  assignRoles(byRoom, proj.starters, roles);
  const map = new Map(Object.values(byRoom).flat().map(e => [e.index, e]));
  const m = map.get(me.index);
  return { map, role: m.role, rank: m.rank + 1, pathToStart: m.pathToStart };
}

const lowest = list => list.length ? list.reduce((a, b) => b.kv < a.kv ? b : a) : null;

// Room for a newcomer: a free board slot, under the position cap and under rosterMax. Otherwise
// one cut that fixes all three (same room for the cap, a board player for a full board): keep
// value cutMargin+ below his, in cutRoles once he arrives, recruits first, at most maxRealCuts
// real players per school.
// A returning player may only be cut (and so possibly deleted) when deleteOnly allows it:
// a rising senior, or in an oversaturated room (null = anyone).
export const deletable = (e, room, pl) => !pl.deleteOnly ||
  (pl.deleteOnly.risingSeniors && e.year === "Senior") || pl.deleteOnly.rooms.includes(room);

export function roomAt(state, room, me, pl, roles, fit) {
  const proj = state.proj;
  // A school takes no more transfers in a room than the starters it lost there + transferLimit.extra (fit.mjs).
  const newcomers = proj.rooms[room].filter(e => e.tags.some(t => /^Transfer from/.test(t))).length;
  if (fit.transferLimit != null && newcomers >= (proj.needs[room]?.lost.length ?? 0) + fit.transferLimit.extra) return null;
  const needCap = proj.rooms[room].length >= (pl.caps[room] ?? Infinity);
  const needBoard = state.board >= BOARD_SLOTS;
  const needRoster = proj.rosterNextSeason >= pl.rosterMax;
  const rw = rolesWith(proj, room, me, roles);
  if (!needCap && !needBoard && !needRoster) return { cut: null, rw };
  // Only a transfer rated cutRecruitsFrom+ may take a signed recruit's spot (null = any).
  const pool = (needCap ? proj.rooms[room] : Object.values(proj.rooms).flat()).filter(e => e.cuttable && e.kv <= me.kv - pl.cutMargin &&
    (pl.cutRecruitsFrom == null || me.overall >= pl.cutRecruitsFrom || e.kind !== "Recruit") &&
    (e.kind === "Recruit" || deletable(e, room, pl)) &&
    (!needBoard || e.onBoard) && pl.cutRoles.includes(rw.map.get(e.index)?.role ?? e.role));
  const cut = lowest(pool.filter(e => e.kind === "Recruit")) ??
    (state.realCuts < pl.maxRealCuts ? lowest(pool.filter(e => e.kind !== "Recruit")) : null);
  if (!cut) return null;
  return { cut, rw, reason: needCap ? `${room} cap` : needBoard ? "board full" : `${pl.rosterMax} limit` };
}

export function planPlacement(d, league, settings, cleanup, locks = null) {
  const started = Date.now();
  const pl = settings.signingDay.placement;
  const userTeam = d.findTeamByName(settings.userTeam)?.index ?? null;
  const cleanupRow = new Map(cleanup.teams.map(t => [t.teamIndex, t]));
  const live = liveLeague(d, league);

  // Next season's rosters after the recruit cleanup (CPU teams only). Committed transfers
  // (the game's and the tool's weekly commits) are never cut.
  for (const e of cleanup.unsign) removeFromTeam(live, e.teamIndex, e.index, e.position, settings);
  const states = new Map();
  for (const [ti, proj] of live.teams) {
    if (ti === userTeam || !cleanupRow.has(ti)) continue;
    for (const e of Object.values(proj.rooms).flat()) {
      const p = d.playerByIndex.get(e.index);
      Object.assign(e, { kind: kindOf(p), kv: keepValue(d, p, pl), cuttable: !isProtected(d, p, pl) && !p.transferCommitted && !locks?.keep.has(p.index), onBoard: d.boardTeamByPlayerRef.get(p.ref) === ti });
    }
    states.set(ti, { teamIndex: ti, team: proj.team, proj, rosterStart: proj.rosterNextSeason, board: cleanupRow.get(ti).boardAfter, realCuts: 0, placed: [], cuts: [] });
  }

  // Transfers already committed (shown with the school's transfers in; already on its roster).
  // A weekly commit the game didn't sign (HardCommitted, off every board: his school never had
  // him on its recruiting board) is deleted at the rollover, so he is signed here (sign: true)
  // and takes a board slot.
  const committed = [];
  for (const p of d.players) {
    if (!p.isTransfer || !p.transferCommitted || p.destination === null || p.destination === NO_TEAM) continue;
    const e = { index: p.index, name: p.name, position: p.position, overall: p.overall, max: d.maxOverall(p), year: p.schoolYear,
      stars: p.stars, nationalRank: p.nationalRank, positionRank: p.positionRank, from: d.teamName(p.prevTeam),
      teamIndex: p.destination, team: d.teamName(p.destination), how: "Committed", role: null, rank: null, cut: null,
      sign: !d.boardTeamByPlayerRef.has(p.ref) };
    committed.push(e);
    const state = states.get(p.destination);
    if (!state) { e.sign = false; continue; }   // the user team
    state.placed.push(e);
    if (e.sign) state.board++;
  }

  const cuts = [], placed = [], unplaced = [], reoffer = [];
  const doCut = (state, c, reason, forName, roleOnceHeArrives = null) => {
    removeFromTeam(live, state.teamIndex, c.index, c.position, settings);
    if (c.onBoard) state.board--;
    if (c.kind !== "Recruit" && forName) state.realCuts++;
    const p = d.playerByIndex.get(c.index);
    const e = { index: c.index, name: c.name, position: c.position, overall: c.overall, max: d.maxOverall(p), year: p.schoolYear, kv: c.kv,
      kind: c.kind, role: roleOnceHeArrives ?? c.role, teamIndex: state.teamIndex, team: state.team, reason, forName, fate: c.kind === "Recruit" ? "Un-signed" : null };
    cuts.push(e); state.cuts.push(e);
    if (c.kind !== "Recruit") reoffer.push(e);
  };
  const doPlace = (state, p, me, how, r, from) => {
    if (r.cut) doCut(state, r.cut, r.reason, p.name, r.rw.map.get(r.cut.index)?.role);
    addToTeam(live, state.teamIndex, me, settings);
    state.board++;
    const e = { index: p.index, name: p.name, position: p.position, overall: p.overall, max: d.maxOverall(p), year: p.schoolYear, kv: me.kv,
      stars: p.stars, nationalRank: p.isTransfer ? p.nationalRank : null, positionRank: p.isTransfer ? p.positionRank : null, from, teamIndex: state.teamIndex, team: state.team, how, role: r.rw.role, rank: r.rw.rank, pathToStart: r.rw.pathToStart,
      protected: isProtected(d, p, pl), cut: r.cut ? r.cut.name : null };
    placed.push(e); state.placed.push(e);
    return e;
  };
  // Boards over BOARD_SLOTS after signing those commits: un-sign the lowest keep value recruits on the board.
  for (const state of states.values()) {
    while (state.board > BOARD_SLOTS) {
      const c = lowest(Object.values(state.proj.rooms).flat().filter(e => e.kind === "Recruit" && e.onBoard && e.cuttable));
      if (!c) break;
      doCut(state, c, "board full", null);
    }
  }

  // Nobody on his list has room or wants him: the school with room he likes most
  // (his player score; schools that meet his dealbreaker first). Cut players (wantedFirst)
  // try schools that want him (team score above 0) before the rest. His old school comes last (P5).
  // A transfer is only placed where his role once he arrives is in placeRoles (null = any).
  const playsAt = r => r && (!pl.placeRoles || pl.placeRoles.includes(r.rw.role)) ? r : null;
  const lockedOut = (playerIndex, teamIndex) => !!locks?.notAt.get(playerIndex)?.has(teamIndex);
  const bestFit = (w, room, me, skip, wantedFirst = false, mustPlay = false) => {
    const wanted = t => wantedFirst && t.score > 0 ? 1 : 0;
    const order = w.teams.filter(t => states.has(t.teamIndex) && t.teamIndex !== skip && !lockedOut(me.index, t.teamIndex))
      .sort((a, b) => a.oldTeam - b.oldTeam || wanted(b) - wanted(a) || b.meets - a.meets || b.playerScore - a.playerScore || b.combined - a.combined);
    for (const t of order) {
      const state = states.get(t.teamIndex);
      const r = roomAt(state, room, me, pl, settings.roles, settings.fit);
      if (r && (!mustPlay || playsAt(r))) return { state, r };
    }
    return null;
  };

  // 1. Uncommitted transfers, best max overall first (the draft line); each sees the live Top 10.
  const queue = d.players.filter(p => p.isTransfer && !p.transferCommitted && roomOf(p.position))
    .sort((a, b) => d.maxOverall(b) - d.maxOverall(a) || b.overall - a.overall || a.name.localeCompare(b.name));
  for (const p of queue) {
    const room = roomOf(p.position);
    const me = meFor(d, p, pl, p.prevTeam);
    const w = destinations(d, live, p.index, settings);
    let done = null;
    for (const [i, t] of w.top10.entries()) {
      const state = states.get(t.teamIndex);
      if (!state || lockedOut(p.index, t.teamIndex)) continue;   // the user team, or undone in the GUI
      const r = playsAt(roomAt(state, room, me, pl, settings.roles, settings.fit));
      if (r) { done = doPlace(state, p, me, `Top 10 #${i + 1}`, r, d.teamName(p.prevTeam)); break; }
    }
    if (!done) {
      const b = bestFit(w, room, me, null, false, true);
      if (b) done = doPlace(b.state, p, me, "Best fit", b.r, d.teamName(p.prevTeam));
    }
    if (!done) unplaced.push({ index: p.index, name: p.name, position: p.position, overall: p.overall, max: d.maxOverall(p), year: p.schoolYear,
      from: d.teamName(p.prevTeam), kv: me.kv, protected: isProtected(d, p, pl), stars: p.stars, nationalRank: p.nationalRank, positionRank: p.positionRank });
  }

  // 2. Teams still over rosterMax (the game would cut its own way): recruits first, then the
  //    lowest keep value bench players. Never protected players or placed transfers.
  const over = [];
  for (const state of states.values()) {
    while (state.proj.rosterNextSeason > pl.rosterMax) {
      const pool = Object.entries(state.proj.rooms).flatMap(([room, list]) => list.filter(e => e.cuttable && pl.cutRoles.includes(e.role) &&
        (e.kind === "Recruit" || deletable(e, room, pl))));
      const c = lowest(pool.filter(e => e.kind === "Recruit")) ?? lowest(pool);
      if (!c) { over.push({ team: state.team, roster: state.proj.rosterNextSeason }); break; }
      doCut(state, c, `trim to ${pl.rosterMax}`, null);
    }
  }

  // 3. Cut real players go where they'd like most among schools with room (same cut rules);
  //    only those with nowhere to go are deleted.
  for (let i = 0; i < reoffer.length; i++) {
    const c = reoffer[i];
    if (pl.moveCutFrom != null && c.overall < pl.moveCutFrom) { c.fate = "Deleted"; continue; }   // only moveCutFrom+ are offered elsewhere
    const p = d.playerByIndex.get(c.index);
    const me = meFor(d, p, pl, c.teamIndex);
    const b = bestFit(destinations(d, live, p.index, settings), roomOf(p.position), me, c.teamIndex, true);
    if (!b) { c.fate = "Deleted"; continue; }
    const e = doPlace(b.state, p, me, "Cut elsewhere", b.r, c.team);
    c.fate = `Moved → ${e.team} (${e.role})`;
  }

  // Game commits: their role on the final roster.
  for (const e of committed) {
    const x = live.teams.get(e.teamIndex)?.rooms[roomOf(e.position)]?.find(y => y.index === e.index);
    if (x) { e.role = x.role; e.rank = x.rank + 1; }
  }

  const avg = list => list.length ? Math.round(list.reduce((a, e) => a + e.overall, 0) / list.length * 10) / 10 : null;
  const teams = [...states.values()].map(s => ({ teamIndex: s.teamIndex, team: s.team, prestige: d.teams.get(s.teamIndex).prestige, rosterStart: s.rosterStart, rosterEnd: s.proj.rosterNextSeason, board: s.board,
    placed: s.placed, cuts: s.cuts, inCount: s.placed.length, cutCount: s.cuts.length, avgIn: avg(s.placed), avgCut: avg(s.cuts) }));
  return { transfers: queue.length, placed: placed.filter(e => e.how !== "Cut elsewhere"), moved: placed.filter(e => e.how === "Cut elsewhere"),
    committed, cuts, unplaced, over, teams, rosterMax: pl.rosterMax, cutMargin: pl.cutMargin, maxRealCuts: pl.maxRealCuts, ms: Date.now() - started };
}
