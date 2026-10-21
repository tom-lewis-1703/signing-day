// Step 4b: player side ("would he go there?") and the combined Top 10 preview.
// Read-only. Builds on fit.mjs (team side).
//
// Player score (0-100) at a team:
//   yearWeight x playing time  +  (1 - yearWeight) x [dealbreaker, the other categories
//   of his ideal pitch, prestige where he'd play, projected team strength, home state]
//   +  small deterministic jitter. yearWeight shrinks above a rating (playingTimeByRating).
// Dealbreaker and pitch categories = the game's school grade for them (MySchoolTrackingTable;
// Playing Style by archetype, Pro Potential by position group). Playing Time = his role
// there; Proximity = home state. The dealbreaker is also pass/fail: the grade must reach
// dealbreakerBar for his OVR (Playing Time: Starter or Rotation; Proximity: home state),
// as in the base game.
// Prestige floor by current OVR: preferred level, or the fallback when no team at the
// preferred level has a team score of spotOrNeed or more. His old school is always allowed.
// Combined = playerWeight x player score + (1 - playerWeight) x team score / 2.
// The user's team skips the team side and the prestige floor (it picks its own needs):
// it is in the list whenever it meets his dealbreaker, ranked by his player score.
// Coach perks count for the user team only (at his perk group): dealbreaker threshold
// decrease lowers its bar that many grade steps; a transfer interest boost of perk.full or
// more lets it join his list when it ranks within his top perk.userReach eligible schools
// (at its own spot, or #10). AI schools' perks are ignored.
import fs from "node:fs";
import { whoWantsHim } from "./fit.mjs";
import { GRADES, gradeValue } from "./dynasty.mjs";

// Ideal recruiting pitch -> in-game name and its three categories.
export const PITCHES = JSON.parse(fs.readFileSync(new URL("./data/pitches.json", import.meta.url), "utf8"));

// Index into the coach perk arrays (QB, RB/FB, WR/TE, OL, DL, LB, DB, K/P).
const PERK_INDEX = { QB: 0, HB: 1, FB: 1, WR: 2, TE: 2, OT: 3, OG: 3, C: 3, EDGE: 4, DT: 4, LB: 5, CB: 6, S: 6, K: 7, P: 7 };
const PRO_GROUP = { QB: "QB", HB: "RB", FB: "RB", WR: "WR", TE: "TE", OT: "OL", OG: "OL", C: "OL",
  EDGE: "DL", DT: "DL", LB: "LB", CB: "DB", S: "DB", K: "K", P: "P" };

// Average OVR of each team's projected starters, scaled 0-100 across the league (cached).
export function teamStrength(league) {
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

// The school's grade (letter) for one of his categories (dealbreaker or pitch category),
// or null when it has no school grade (Playing Time, Proximity, none).
export function categoryGrade(category, p, room, team) {
  switch (category) {
    case "PlayingTime": case "ProximityToHome": case "": return null;
    case "PlayingStyle": return team.playingStyle ? String(team.playingStyle[p.archetype] ?? "") || null : null;
    case "ProPotential": return team.proPotential[PRO_GROUP[room]] || null;
    default: return team.grades[category] || null;
  }
}
export const dealbreakerGrade = (p, room, team) => categoryGrade(p.dealbreaker, p, room, team);

// His pitch categories other than his (original) dealbreaker: normally two; all three when
// his dealbreaker isn't one of them (Gym Rat players in the save).
export function pitchSecondaries(p) {
  return (PITCHES[p.pitch]?.categories || []).filter(c => c !== p.dealbreaker);
}

function meetsDealbreaker(p, t, grade, home, ps, relief) {
  if (p.dealbreaker === "PlayingTime") return t.role === "Starter" || t.role === "Rotation";
  if (p.dealbreaker === "ProximityToHome") return !!home;
  if (!grade) return true;
  const bar = ps.dealbreakerBar.find(b => p.overall >= b.minOverall)?.grade ?? "F";
  return GRADES.indexOf(grade) >= Math.max(0, GRADES.indexOf(bar) - relief);
}

// Year weight for playing time, shrunk for higher-rated players (playingTimeByRating).
function playingTimeWeight(p, year, ps) {
  const factor = (ps.playingTimeByRating || []).find(r => p.overall >= r.minOverall)?.factor ?? 1;
  return (ps.yearWeight[year] ?? 0.5) * factor;
}

function playerScore(p, t, team, strength, settings, season, secondaries, relief) {
  const ps = settings.playerSide;
  const w = playingTimeWeight(p, t.year, ps);
  const playingTime = Math.min(100, t.roleScore);
  // Prestige counts whatever his role; Playing Time already scores the role.
  const prestige = team.prestige * 10;
  const home = p.homeState && p.homeState === team.state ? 100 : 0;
  // Value 0-100 of this school on one category (no school grade = neutral 50).
  const value = c => c === "PlayingTime" ? playingTime : c === "ProximityToHome" ? home
    : (g => g ? gradeValue(g) : 50)(categoryGrade(c, p, t.room, team));
  const grade = dealbreakerGrade(p, t.room, team);
  const db = p.dealbreaker ? value(p.dealbreaker) : 50;
  // The pitch categories share 2 x rest.secondary evenly (10% each when there are two);
  // no pitch scores neutral.
  const sec = secondaries.map(value);
  const secAvg = sec.length ? sec.reduce((a, v) => a + v, 0) / sec.length : 50;
  // How the school looks on his two pitch categories (grade letter, his role, or home).
  const pitchGrades = secondaries.map(c => c === "PlayingTime" ? t.role : c === "ProximityToHome" ? (home ? "home" : "away")
    : categoryGrade(c, p, t.room, team) || "-");
  const meets = meetsDealbreaker(p, t, grade, home, ps, relief);
  const r = ps.rest;
  const rest = r.dealbreaker * db + 2 * (r.secondary ?? 0) * secAvg + r.prestige * prestige +
    r.teamStrength * strength.score + r.home * home;
  const score = w * playingTime + (1 - w) * rest + jitter(p.index, team.index, season, ps.jitter);
  return {
    playerScore: Math.max(0, Math.min(100, Math.round(score))),
    meets, dealbreakerGrade: grade, pitchGrades,
    parts: { yearWeight: w, playingTime, dealbreakerValue: db, secondaryValues: sec, prestige, teamStrength: strength.score, home }
  };
}

// League average of this season's starters per room (cached on the league).
export function nowRoomAverages(league) {
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
// team is allowed by the prestige floor. Sorted: his Top 10 first, then the rest.
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

  // A dropped dealbreaker scores neutral and never blocks a school. Pitch secondaries come
  // from his original dealbreaker (a dropped Playing Time doesn't become a secondary).
  const dealbreaker = effectiveDealbreaker(p, w.room, w.year, league, ps);
  const pe = dealbreaker === p.dealbreaker ? p : { ...p, dealbreaker };
  const secondaries = pitchSecondaries(p);
  const group = PERK_INDEX[w.room];
  let teams = w.teams.map(t => {
    const team = d.teams.get(t.teamIndex);
    const s = strength.get(t.teamIndex);
    const userTeamRow = t.teamIndex === userTeam;
    // Coach perks: user team only.
    const perk = userTeamRow ? team.transferPerk[group] || 0 : 0;
    const relief = userTeamRow ? team.dealbreakerRelief[group] || 0 : 0;
    const ps2 = playerScore(pe, { ...t, year: w.year }, team, s, settings, season, secondaries, relief);
    const allowed = userTeamRow || team.prestige >= minPrestige;
    // P5: never back to the school he left (only Signing Day's last-resort best fit).
    const wantsHim = !t.oldTeam && (userTeamRow || t.score > 0);
    const combined = userTeamRow ? ps2.playerScore : Math.round(ps.playerWeight * ps2.playerScore + (1 - ps.playerWeight) * t.baseScore / 2);
    return { ...t, ...ps2, prestigeLevel: team.prestige, strengthAvg: s.avg, allowed, combined, wantsHim, userTeam: userTeamRow,
      perk, perkReach: perk >= ps.perk.full, joinedByPerk: false, eligible: allowed && wantsHim && ps2.meets };
  });
  teams.sort((a, b) => b.eligible - a.eligible || b.combined - a.combined || b.upgrade - a.upgrade || a.team.localeCompare(b.team));
  const eligibleTeams = teams.filter(t => t.eligible);
  let top10 = eligibleTeams.slice(0, 10);
  // User team's full transfer perk: it joins his list at #10 when it ranks 11th to userReach.
  const u = eligibleTeams.findIndex(t => t.userTeam);
  if (u >= 10 && u < ps.perk.userReach && eligibleTeams[u].perkReach) {
    eligibleTeams[u].joinedByPerk = true;
    top10 = [...eligibleTeams.slice(0, 9), eligibleTeams[u]];
    const inTop = new Set(top10);
    teams = [...top10, ...teams.filter(t => !inTop.has(t))];
  }
  return {
    ...w, teams, top10, dealbreaker: dealbreaker || "none", originalDealbreaker: p.dealbreaker, homeState: p.homeState, archetype: p.archetype,
    pitch: PITCHES[p.pitch]?.name || p.pitch || "none", secondaries, userRank: u >= 0 ? u + 1 : null, userReach: ps.perk.userReach,
    floor: floorNote, minPrestige, eligible: eligibleTeams.length,
    dealbreakerBar: settings.playerSide.dealbreakerBar.find(b => p.overall >= b.minOverall)?.grade ?? null
  };
}
