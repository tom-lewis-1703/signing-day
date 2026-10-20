// Step 4b: player side ("would he go there?") and the combined Top 10 preview.
// Read-only. Builds on fit.mjs (team side).
//
// Player score (0-100) at a team:
//   yearWeight x playing time  +  (1 - yearWeight) x [dealbreaker, prestige where he'd
//   play, projected team strength, home state]  +  small deterministic jitter.
// Dealbreaker = the game's school grade for it (MySchoolTrackingTable; Playing Style by
// archetype, Pro Potential by position group). Playing Time = his role there; Proximity =
// home state. It is also pass/fail: the grade must reach dealbreakerBar for his OVR
// (Playing Time: Starter or Rotation; Proximity: home state), as in the base game.
// Prestige floor by current OVR: preferred level, or the fallback when no team at the
// preferred level has a team score of spotOrNeed or more. His old school is always allowed.
// Combined = playerWeight x player score + (1 - playerWeight) x team score / 2.
// The user's team skips the team side and the prestige floor (it picks its own needs):
// it is in the list whenever it meets his dealbreaker, ranked by his player score.
// Coach perks (any school, at his perk group): dealbreaker threshold decrease lowers the
// bar that many grade steps; transfer interest boost of perk.full or more moves the
// school to #2 of his Top 10 (it stays #1 if already there), a smaller boost adds that
// many points to its combined score.
import { whoWantsHim } from "./fit.mjs";
import { GRADES, gradeValue } from "./dynasty.mjs";

// Index into the coach perk arrays (QB, RB/FB, WR/TE, OL, DL, LB, DB, K/P).
const PERK_INDEX = { QB: 0, HB: 1, FB: 1, WR: 2, TE: 2, OT: 3, OG: 3, C: 3, EDGE: 4, DT: 4, LB: 5, CB: 6, S: 6, K: 7, P: 7 };
const PRO_GROUP = { QB: "QB", HB: "RB", FB: "RB", WR: "WR", TE: "TE", OT: "OL", OG: "OL", C: "OL",
  EDGE: "DL", DT: "DL", LB: "LB", CB: "DB", S: "DB", K: "K", P: "P" };

// Average OVR of each team's projected starters, scaled 0-100 across the league (cached).
function teamStrength(league) {
  if (league._strength) return league._strength;
  const avg = new Map();
  for (const proj of league.teams.values()) {
    let sum = 0, n = 0;
    for (const [room, list] of Object.entries(proj.rooms)) {
      for (const e of list.slice(0, proj.starters[room] ?? 0)) { sum += e.overall; n++; }
    }
    avg.set(proj.teamIndex, n ? sum / n : 0);
  }
  const vals = [...avg.values()], lo = Math.min(...vals), hi = Math.max(...vals);
  league._strength = new Map([...avg].map(([t, v]) => [t, { avg: Math.round(v * 10) / 10, score: hi > lo ? Math.round((v - lo) / (hi - lo) * 100) : 50 }]));
  return league._strength;
}

// Deterministic jitter in [-j, +j] per player, team and season.
function jitter(playerIndex, teamIndex, season, j) {
  if (!j) return 0;
  let h = (playerIndex * 73856093) ^ (teamIndex * 19349663) ^ ((season || 0) * 83492791);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h ^= h >>> 16;
  return ((h >>> 0) / 0xffffffff * 2 - 1) * j;
}

// The school's grade for his dealbreaker (letter), or null when it has no school grade.
export function dealbreakerGrade(p, room, team) {
  switch (p.dealbreaker) {
    case "PlayingTime": case "ProximityToHome": case "": return null;
    case "PlayingStyle": return team.playingStyle ? String(team.playingStyle[p.archetype] ?? "") || null : null;
    case "ProPotential": return team.proPotential[PRO_GROUP[room]] || null;
    default: return team.grades[p.dealbreaker] || null;
  }
}

function meetsDealbreaker(p, t, team, grade, home, ps) {
  if (p.dealbreaker === "PlayingTime") return t.role === "Starter" || t.role === "Rotation";
  if (p.dealbreaker === "ProximityToHome") return !!home;
  if (!grade) return true;
  const bar = ps.dealbreakerBar.find(b => p.overall >= b.minOverall)?.grade ?? "F";
  const relief = team.dealbreakerRelief[PERK_INDEX[t.room]] || 0;
  return GRADES.indexOf(grade) >= Math.max(0, GRADES.indexOf(bar) - relief);
}

function playerScore(p, t, team, strength, settings, season) {
  const ps = settings.playerSide;
  const w = ps.yearWeight[t.year] ?? 0.5;
  const playingTime = Math.min(100, t.roleScore);
  const plays = t.role === "Starter" || t.role === "Rotation" || t.pathToStart;
  const prestige = plays ? team.prestige * 10 : 0;
  const home = p.homeState && p.homeState === team.state ? 100 : 0;
  const grade = dealbreakerGrade(p, t.room, team);
  const db = p.dealbreaker === "PlayingTime" ? playingTime : p.dealbreaker === "ProximityToHome" ? home : grade ? gradeValue(grade) : 50;
  const meets = meetsDealbreaker(p, t, team, grade, home, ps);
  const r = ps.rest;
  const rest = r.dealbreaker * db + r.prestige * prestige + r.teamStrength * strength.score + r.home * home;
  const score = w * playingTime + (1 - w) * rest + jitter(p.index, team.index, season, ps.jitter);
  return {
    playerScore: Math.max(0, Math.min(100, Math.round(score))),
    meets, dealbreakerGrade: grade,
    parts: { yearWeight: w, playingTime, dealbreakerValue: db, prestige, teamStrength: strength.score, home }
  };
}

// League average of this season's starters per room (cached on the league).
function nowRoomAverages(league) {
  if (league._nowRoomAvg) return league._nowRoomAvg;
  const sum = {}, n = {};
  for (const proj of league.teams.values()) for (const [room, need] of Object.entries(proj.needs)) {
    for (const v of need?.nowStarterOveralls || []) { sum[room] = (sum[room] || 0) + v; n[room] = (n[room] || 0) + 1; }
  }
  return (league._nowRoomAvg = Object.fromEntries(Object.keys(sum).map(r => [r, sum[r] / n[r]])));
}

// Playing Time is dropped for players below their position's average starter (seniors next
// season: below that average minus playingTimeDrop.seniorMargin); they get no dealbreaker.
function effectiveDealbreaker(p, room, nextYear, league, ps) {
  if (p.dealbreaker !== "PlayingTime") return p.dealbreaker;
  const avg = nowRoomAverages(league)[room];
  if (avg === undefined) return p.dealbreaker;
  const bar = avg - (nextYear === "Senior" ? ps.playingTimeDrop.seniorMargin : 0);
  return p.overall < bar ? "" : p.dealbreaker;
}

function floorFor(p, ps) {
  return ps.prestigeFloor.find(f => p.overall >= f.minOverall) || null;
}

// Every team for one player with team score, player score, combined, and whether the
// team is allowed by the prestige floor. Sorted: allowed teams that want him first.
export function destinations(d, league, playerIndex, settings) {
  const w = whoWantsHim(d, league, playerIndex, settings);
  const p = d.playerByIndex.get(playerIndex);
  if (!w.room) return { ...w, dealbreaker: p.dealbreaker, homeState: p.homeState, floor: null, top10: [] };
  const ps = settings.playerSide;
  const strength = teamStrength(league);
  const season = d.stage.seasonYear;
  const userTeam = d.findTeamByName(settings.userTeam)?.index ?? null;

  // Prestige floor: preferred level unless no team there has a spot or need for him.
  const fl = floorFor(p, ps);
  let minPrestige = 0, floorNote = "none (under 85)";
  if (fl) {
    const spotAtPreferred = w.teams.some(t => d.teams.get(t.teamIndex).prestige >= fl.preferred && t.baseScore >= ps.spotOrNeed);
    minPrestige = spotAtPreferred ? fl.preferred : fl.fallback;
    floorNote = spotAtPreferred ? `prestige ${fl.preferred}+ (preferred)` : `prestige ${fl.fallback}+ (fallback: no ${fl.preferred}+ team has a spot)`;
  }

  // A dropped dealbreaker scores neutral and never blocks a school.
  const dealbreaker = effectiveDealbreaker(p, w.room, w.year, league, ps);
  const pe = dealbreaker === p.dealbreaker ? p : { ...p, dealbreaker };
  const teams = w.teams.map(t => {
    const team = d.teams.get(t.teamIndex);
    const s = strength.get(t.teamIndex);
    const ps2 = playerScore(pe, { ...t, year: w.year }, team, s, settings, season);
    const userTeamRow = t.teamIndex === userTeam;
    const allowed = userTeamRow || team.prestige >= minPrestige || t.oldTeam;
    const wantsHim = userTeamRow || t.score > 0;
    const perk = team.transferPerk[PERK_INDEX[w.room]] || 0;
    const base = userTeamRow ? ps2.playerScore : Math.round(ps.playerWeight * ps2.playerScore + (1 - ps.playerWeight) * t.baseScore / 2);
    const combined = base + (perk > 0 && perk < ps.perk.full ? perk : 0);
    return { ...t, ...ps2, prestigeLevel: team.prestige, strengthAvg: s.avg, allowed, combined, wantsHim, userTeam: userTeamRow,
      perk, portalKing: perk >= ps.perk.full, eligible: allowed && wantsHim && ps2.meets };
  });
  teams.sort((a, b) => b.eligible - a.eligible || b.combined - a.combined || b.upgrade - a.upgrade || a.team.localeCompare(b.team));
  // Full transfer perk: schools in his Top 10 move up to #2 (best of them first; #1 stays).
  let top10 = teams.filter(t => t.eligible).slice(0, 10);
  const kings = top10.slice(1).filter(t => t.portalKing);
  if (kings.length) {
    top10 = [top10[0], ...kings, ...top10.slice(1).filter(t => !t.portalKing)];
    teams.splice(0, top10.length, ...top10);
  }
  return {
    ...w, teams, top10, dealbreaker: dealbreaker || "none", originalDealbreaker: p.dealbreaker, homeState: p.homeState, archetype: p.archetype,
    floor: floorNote, minPrestige, eligible: teams.filter(t => t.eligible).length,
    dealbreakerBar: settings.playerSide.dealbreakerBar.find(b => p.overall >= b.minOverall)?.grade ?? null
  };
}

