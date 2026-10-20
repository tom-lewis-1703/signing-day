// Phase 2, step 3 (team side): "would they want me?" Read-only scoring of a player
// at every team, from the step 3 projection and the step 4 ceiling.
//
// - Need per room, the stronger of:
//   drop-off: this season's starters vs next season's, slot by slot (best vs best...),
//     averaged; ×1 at no drop up to need.maxMult at need.fullDropOff or more;
//   weakness: next season's starters vs the level expected for this team (the league's
//     average starter in that room, shifted by how far the team's other starters sit
//     from the league average); from need.weakFrom OVR below (half way) up to
//     need.maxMult at need.weakFull or more.
//   Stacked (no starter lost, none replaced by a newcomer, not weak, plus a backup within
//   stackedBackupBar of the weakest starter) gets need.stacked instead.
// - Per player, the need can rise further (and override Stacked):
//   upgrade: he'd start and beat the weakest starter by upgrade.from+ OVR after weighting
//     by that starter's level vs the league average in the room (×1, up to upgrade.maxMult
//     at upgrade.full+);
//   succession: every starter is in his final year next season and he's in
//     succession.years with a path to start (or would start) -> succession.mult.
// - Position importance: the team score is multiplied by positionWeight[room].
// - Lookalikes: x lookalike.mult for each incoming player (transfer or recruit) already in the
//   room with his next-season year and an OVR within lookalike.ovrWithin.
// - Newcomers: he only beats a transfer already coming in for a starting spot by
//   newcomerUpgrade+ OVR (else Backup); a school wants no more transfers in a room than the
//   starters it lost there + transferLimit.extra (score 0).
// - Role there: where his OVR would rank in that room (same cutoffs as the depth
//   chart), scored by settings.fit.roleScore, plus a path-to-start bonus by his
//   next-season year.
// - Starter level: a projected starter more than starterLevel.margin below the usual starter
//   at that position for schools of the same prestige is a stopgap, treated as a Backup.
// - Level: a non-starter only interests a team if his max overall reaches its weakest
//   projected starter minus levelBar (for a stopgap: the prestige starter level).
// Fit = role score x need multiplier (0 when the level check fails).
import { nextClass, classRank } from "./dynasty.mjs";
import { roomOf } from "./depth-chart.mjs";

const OL_ROOMS = ["OT", "OG", "C"];
const SERVICE_ACADEMIES = new Set(["Army", "Navy", "Air Force"]);
const INCOMING = /recruit|Transfer from/;
const NEWCOMER = /^Transfer from/;   // a transfer coming in (game commit or placed by us)

// Same order as the depth chart: OVR, then older first, then name.
const ahead = (e, me) => e.overall > me.overall || (e.overall === me.overall &&
  (e.classRank > me.classRank || (e.classRank === me.classRank && e.name.localeCompare(me.name) < 0)));

// Average OVR of each team's projected starters per room, the league average per room,
// and each team's starter average overall (cached on the league).
export function starterLevels(league) {
  if (league._levels) return league._levels;
  const byTeam = new Map(), roomSum = {}, roomN = {};
  for (const proj of league.teams.values()) {
    const rooms = {};
    for (const [room, list] of Object.entries(proj.rooms)) {
      const st = list.slice(0, proj.starters[room] ?? 0);
      if (!st.length) continue;
      rooms[room] = { sum: st.reduce((a, e) => a + e.overall, 0), n: st.length };
      roomSum[room] = (roomSum[room] || 0) + rooms[room].sum / rooms[room].n;
      roomN[room] = (roomN[room] || 0) + 1;
    }
    byTeam.set(proj.teamIndex, rooms);
  }
  const leagueRoom = Object.fromEntries(Object.keys(roomSum).map(r => [r, roomSum[r] / roomN[r]]));
  return (league._levels = { byTeam, leagueRoom });
}

// Level expected for a room at a team: league room average + how far the team's other
// starters sit above or below their league room averages.
function expectedLevel(levels, teamIndex, room) {
  const rooms = levels.byTeam.get(teamIndex) || {};
  let diff = 0, n = 0;
  for (const [r, v] of Object.entries(rooms)) {
    if (r === room) continue;
    diff += (v.sum / v.n - levels.leagueRoom[r]) * v.n; n += v.n;
  }
  return levels.leagueRoom[room] + (n ? diff / n : 0);
}

// Usual starter level per prestige and room: the average of this season's starters at
// every school with that prestige (cached on the league).
export function prestigeTargets(d, league) {
  if (league._prestigeTargets) return league._prestigeTargets;
  const sum = {}, n = {};
  for (const proj of league.teams.values()) {
    const pr = d.teams.get(proj.teamIndex).prestige;
    for (const [room, need] of Object.entries(proj.needs)) {
      const now = need?.nowStarterOveralls || [];
      if (!now.length) continue;
      const k = pr + "|" + room;
      sum[k] = (sum[k] || 0) + now.reduce((a, b) => a + b, 0) / now.length;
      n[k] = (n[k] || 0) + 1;
    }
  }
  const out = {};
  for (const k of Object.keys(sum)) { const [pr, room] = k.split("|"); (out[pr] ??= {})[room] = Math.round(sum[k] / n[k] * 10) / 10; }
  return (league._prestigeTargets = out);
}

// Need status of every room at a team (cached on the projection).
export function roomNeeds(proj, fit, league) {
  if (proj._needs) return proj._needs;
  const levels = starterLevels(league);
  const out = {};
  for (const [room, list] of Object.entries(proj.rooms)) {
    const S = proj.starters[room] ?? 0;
    if (!S) { out[room] = { status: "None", mult: 0, open: 0, dropOff: 0 }; continue; }
    const n = proj.needs[room];
    const open = Math.max(n?.open ?? 0, S - list.length);
    const starters = list.slice(0, S);
    const backup = list[S];
    const full = fit.need.fullDropOff;
    // Slot-by-slot drop from this season's starters; an empty slot counts as a full drop.
    const now = n?.nowStarterOveralls ?? [];
    let drop = 0;
    for (let i = 0; i < S; i++) {
      if (now[i] === undefined) continue;
      drop += i < starters.length ? Math.max(-full, Math.min(full, now[i] - starters[i].overall)) : full;
    }
    const dropOff = Math.max(0, Math.round(drop / S * 10) / 10);
    // Weakness: how far next season's starters sit below the level expected for this team
    // (empty slots count as fully weak).
    const avg = starters.length ? starters.reduce((a, e) => a + e.overall, 0) / starters.length : 0;
    const gap = starters.length < S ? fit.need.weakFull : Math.round((expectedLevel(levels, proj.teamIndex, room) - avg) * 10) / 10;
    const weak = gap >= fit.need.weakFrom;
    const dropMult = 1 + (fit.need.maxMult - 1) * Math.min(dropOff, full) / full;
    const weakMult = weak ? 1 + (fit.need.maxMult - 1) * Math.min(gap, fit.need.weakFull) / fit.need.weakFull : 1;
    const stacked = !weak && starters.length === S && !(n?.lost.length) && starters.every(e => !e.tags.some(t => INCOMING.test(t))) &&
      backup && backup.overall >= starters[S - 1].overall - fit.stackedBackupBar;
    const status = stacked ? "Stacked" : weakMult > dropMult ? "Weak" : dropOff > 0 ? "Drop-off" : "Steady";
    const mult = stacked ? fit.need.stacked : Math.max(dropMult, weakMult);
    out[room] = { status, mult: Math.round(mult * 100) / 100, open, dropOff, weakness: Math.max(0, gap),
      allStartersFinalYear: starters.length === S && starters.every(e => e.finalYear) };
  }
  return (proj._needs = out);
}

// Role of `me` (a depth-chart-style entry) inserted into a team's projected room,
// matching assignRoles() without rebuilding the room.
function roleIn(proj, room, me, roles) {
  const list = proj.rooms[room].filter(e => e.index !== me.index);
  const S = proj.starters[room] ?? 0, r = roles.rotation[room] ?? 0;
  let rank = 0, aheadReturning = 0;
  for (const e of list) if (ahead(e, me)) { rank++; if (!e.finalYear) aheadReturning++; }
  let role;
  if (rank < S) role = "Starter";
  else if (rank < S + r) role = "Rotation";
  else {
    // OL swing: the best non-starters across OT/OG/C
    if (OL_ROOMS.includes(room) && (roles.olSwing ?? 0) > 0) {
      let poolAhead = rank - (S + r);
      for (const o of OL_ROOMS) if (o !== room) {
        const lo = (proj.starters[o] ?? 0) + (roles.rotation[o] ?? 0);
        proj.rooms[o].forEach((e, i) => { if (i >= lo && e.index !== me.index && ahead(e, me)) poolAhead++; });
      }
      if (poolAhead < roles.olSwing) role = "Rotation";
    }
    if (!role) role = rank < Math.max(2 * S, S + r) ? "Backup" : "Buried";
  }
  const pathToStart = role !== "Starter" && !me.finalYear && aheadReturning < S;
  const weakest = list.length >= S && S > 0 ? list[S - 1].overall : null;
  return { role, rank: rank + 1, pathToStart, weakestStarter: weakest };
}

// Fit of one player at one team.
export function fitAt(d, league, p, teamIndex, settings, me = null) {
  const fit = settings.fit;
  const room = roomOf(p.position);
  const proj = league.teams.get(teamIndex);
  if (!room || !proj) return null;
  me ??= meEntry(d, p, league);
  const need = roomNeeds(proj, fit, league)[room];
  const r = roleIn(proj, room, me, settings.roles);
  const rawRole = r.role;
  const max = d.maxOverall(p);
  // Starter level: a projected starter only counts as one when he's within starterLevel.margin
  // of the usual starter at this position for schools of this prestige; below it he's a
  // stopgap the team would replace, treated as a Backup (with a path to start if he's young).
  const targetLevel = prestigeTargets(d, league)[d.teams.get(teamIndex).prestige]?.[room] ?? null;
  const stopgap = r.role === "Starter" && targetLevel !== null && p.overall < targetLevel - fit.starterLevel.margin;
  if (stopgap) { r.role = "Backup"; r.pathToStart = !me.finalYear; }
  // Newcomers: he only takes a starting spot from a transfer already coming in when he's
  // newcomerUpgrade+ OVR better; with newcomerLockAtLevel, never from one at this school's
  // starter level (T10). Otherwise he'd be a Backup behind him.
  const room0 = proj.rooms[room].filter(e => e.index !== p.index);
  const S0 = proj.starters[room] ?? 0;
  const pushed = r.role === "Starter" && room0.length >= S0 && S0 > 0 ? room0[S0 - 1] : null;
  const pushedNewcomer = !!pushed && pushed.tags.some(t => NEWCOMER.test(t));
  const locked = pushedNewcomer && fit.newcomerLockAtLevel && targetLevel !== null && pushed.overall >= targetLevel - fit.starterLevel.margin;
  const behindNewcomer = fit.newcomerUpgrade != null && pushedNewcomer && (locked || p.overall - pushed.overall < fit.newcomerUpgrade);
  if (behindNewcomer) { r.role = "Backup"; r.pathToStart = false; }
  // Room full of newcomers: a school takes at most (starters lost there + transferLimit.extra) transfers per room.
  const newcomers = room0.filter(e => e.tags.some(t => NEWCOMER.test(t))).length;
  const roomFull = fit.transferLimit != null && newcomers >= (proj.needs[room]?.lost.length ?? 0) + fit.transferLimit.extra;
  const levelOk = r.role === "Starter" || r.weakestStarter === null ||
    max >= (stopgap ? targetLevel : r.weakestStarter) - fit.levelBar;
  const pathBonus = r.pathToStart ? (fit.pathToStartBonus[me.year] ?? 0) : 0;
  const roleScore = fit.roleScore[r.role] + pathBonus;
  // How much he'd improve on the starter he replaces (negative when he'd sit).
  const upgrade = r.weakestStarter === null ? p.overall : p.overall - r.weakestStarter;

  // Player-specific need on top of the room's: the stronger of the room's need, an upgrade
  // (he'd start and beat the weakest starter by upgrade.from+), and succession (every starter
  // is in his final year next season and he's young with a path to start). Stacked only
  // applies when neither of those does.
  const stacked = need.status === "Stacked";
  let status = need.status, mult = stacked ? 0 : need.mult;
  // Upgrade is weighed by how good the weakest starter already is: each OVR above the
  // league's average starter in this room shrinks it by levelSlope, each below grows it.
  const u = fit.upgrade;
  const leagueAvg = starterLevels(league).leagueRoom[room];
  const levelFactor = r.weakestStarter === null || leagueAvg === undefined ? 1
    : Math.min(u.maxFactor, Math.max(u.minFactor, 1 + (leagueAvg - r.weakestStarter) * u.levelSlope));
  const weightedUpgrade = Math.round(upgrade * levelFactor * 10) / 10;
  if (r.role === "Starter" && weightedUpgrade >= u.from) {
    const upMult = 1 + (u.maxMult - 1) * Math.min(weightedUpgrade - u.from, u.full - u.from) / (u.full - u.from);
    if (upMult > mult) { mult = upMult; status = "Upgrade"; }
  }
  if (need.allStartersFinalYear && fit.succession.years.includes(me.year) && (r.pathToStart || r.role === "Starter") && fit.succession.mult > mult) {
    mult = fit.succession.mult; status = "Succession";
  }
  if (mult === 0) mult = fit.need.stacked;
  mult = Math.round(mult * 100) / 100;
  const positionWeight = fit.positionWeight[room] ?? 1;
  const la = fit.lookalike;
  const lookalikes = la ? proj.rooms[room].filter(e => e.index !== p.index && e.year === me.year &&
    Math.abs(e.overall - p.overall) <= la.ovrWithin && e.tags.some(t => INCOMING.test(t))).length : 0;
  const laMult = lookalikes ? la.mult ** lookalikes : 1;
  return {
    teamIndex, team: proj.team, room, role: r.role, rawRole, stopgap, targetLevel, rank: r.rank, pathToStart: r.pathToStart,
    roleScore, need: status, needMult: mult, roomNeed: need.status, open: need.open, dropOff: need.dropOff, weakness: need.weakness,
    weakestStarter: r.weakestStarter, levelOk, max, upgrade, weightedUpgrade, positionWeight, lookalikes, behindNewcomer, roomFull,
    // baseScore ranks schools within one player's list; score (with position importance)
    // compares players across positions (Signing Day, #1-pick balancing).
    baseScore: levelOk && !roomFull ? Math.round(roleScore * mult * laMult) : 0,
    score: levelOk && !roomFull ? Math.round(roleScore * mult * positionWeight * laMult) : 0,
    oldTeam: teamIndex === p.prevTeam,
    serviceAcademy: SERVICE_ACADEMIES.has(proj.team)
  };
}

function meEntry(d, p, league) {
  const year = league.projects ? nextClass(p) : p.schoolYear;
  return { index: p.index, name: p.name, overall: p.overall, year, classRank: classRank(year), finalYear: year === "Senior" };
}

// Every team scored for one player, best first. Teams with score 0 are kept at the end.
export function whoWantsHim(d, league, playerIndex, settings) {
  const p = d.playerByIndex.get(playerIndex);
  if (!p) throw new Error("Unknown player.");
  if (!roomOf(p.position)) return { player: p.name, position: p.position, room: null, teams: [] };
  const me = meEntry(d, p, league);
  const teams = [];
  for (const t of league.teams.keys()) teams.push(fitAt(d, league, p, t, settings, me));
  teams.sort((a, b) => b.score - a.score || b.upgrade - a.upgrade || a.team.localeCompare(b.team));
  return {
    player: p.name, position: p.position, room: roomOf(p.position), overall: p.overall, max: d.maxOverall(p),
    year: me.year, dev: p.dev.replace("College_", ""), from: d.teamName(p.prevTeam),
    committedTo: p.destination !== null ? d.teamName(p.destination) : null,
    interested: teams.filter(t => t.score > 0).length, teams
  };
}
