// Phase 2, step 1: project next season's depth chart for every team.
// Players are ranked by current OVR inside their position room (no cross-position
// moves). Roles: Starter, Rotation, Backup, Buried (cutoffs in settings.roles).
import { NO_TEAM, nextClass, classRank } from "./dynasty.mjs";

export const ROOMS = {
  QB: ["QB"], HB: ["HB"], FB: ["FB"], WR: ["WR"], TE: ["TE"],
  OT: ["LT", "RT"], OG: ["LG", "RG"], C: ["C"],
  EDGE: ["LE", "RE"], DT: ["DT", "NT"], LB: ["LOLB", "MLB", "ROLB"],
  CB: ["CB"], S: ["FS", "SS"], K: ["K"], P: ["P"]
};
export const ROOM_ORDER = Object.keys(ROOMS);
const ROOM_OF = new Map(Object.entries(ROOMS).flatMap(([room, ps]) => ps.map(p => [p, room])));
const OL_ROOMS = new Set(["OT", "OG", "C"]);

export const roomOf = position => ROOM_OF.get(position) || null;

export function startersFor(team, settings) {
  const s = settings.starters;
  const off = s.offense[team.offScheme], def = s.defense[team.defScheme];
  const pick = keys => Object.fromEntries(keys.map(k => [k, s.fallback[k] ?? 0]));
  return {
    ...s.base,
    ...(off || pick(["HB", "FB", "WR", "TE"])),
    ...(def || pick(["EDGE", "DT", "LB", "CB", "S"])),
    _schemeKnown: { offense: !!off, defense: !!def }
  };
}

// Offseason saves project next season; anything else is shown as-is.
const projects = stage => stage.supported;

// Team a player will be on next season (null = gone / uncommitted).
export function nextSeasonTeam(p, stage) {
  if (!projects(stage)) return p.team === NO_TEAM ? null : p.team;
  if (p.isTransfer || p.isIncomingRecruit) return p.destination;
  if (p.team === NO_TEAM) return null;
  if (p.outOfEligibility || p.leavingForDraft || p.enteringPortal) return null;
  return p.team;
}

// Team a player was on this season (includes those who have since left).
export function currentSeasonTeam(p) {
  if (p.team !== NO_TEAM) return p.team;
  if (p.prevTeam !== NO_TEAM && (p.isTransfer || p.outOfEligibility)) return p.prevTeam;
  return null;
}

function departureReason(p) {
  if (p.outOfEligibility) return "Graduating";
  if (p.leavingForDraft) return "NFL Draft";
  if (p.isTransfer || p.enteringPortal) return "Portal";
  return "Leaving";
}

const sortRoom = (a, b) => b.overall - a.overall || b.classRank - a.classRank || a.name.localeCompare(b.name);

// Assigns roles in place to entries grouped by room: { QB: [entry...], ... }
export function assignRoles(byRoom, starters, roles) {
  for (const [room, list] of Object.entries(byRoom)) {
    list.sort(sortRoom);
    const S = starters[room] ?? 0;
    list.forEach((e, i) => { e.rank = i; e.role = i < S ? "Starter" : null; });
    let r = roles.rotation[room] ?? 0;
    for (const e of list) if (!e.role && r > 0) { e.role = "Rotation"; r--; }
  }
  // One swing lineman across OT/OG/C
  let swing = roles.olSwing ?? 0;
  if (swing > 0) {
    const pool = [...OL_ROOMS].flatMap(room => byRoom[room] || []).filter(e => !e.role).sort(sortRoom);
    for (const e of pool.slice(0, swing)) e.role = "Rotation";
  }
  for (const [room, list] of Object.entries(byRoom)) {
    const S = starters[room] ?? 0;
    const backupEnd = Math.max(2 * S, S + (roles.rotation[room] ?? 0));
    for (const e of list) if (!e.role) e.role = e.rank < backupEnd ? "Backup" : "Buried";
  }
  // Path to start: next season's final-year players ahead of him will be gone the year after.
  for (const [room, list] of Object.entries(byRoom)) {
    const S = starters[room] ?? 0;
    let aheadReturning = 0;
    for (const e of list) {
      e.pathToStart = e.role !== "Starter" && !e.finalYear && aheadReturning < S;
      if (!e.finalYear) aheadReturning++;
    }
  }
  return byRoom;
}

function entry(d, p, nextYear, teamIndex) {
  const tags = [];
  if (p.isTransfer) tags.push(p.prevTeam === teamIndex ? "Transfer (returning)" : `Transfer from ${d.teamName(p.prevTeam)}`);
  else if (p.isIncomingRecruit) tags.push(p.recruitClass.startsWith("JuniorCollege") ? "JUCO recruit" : "HS recruit");
  if (p.nflRows.length && !p.leavingForDraft) tags.push("Staying (draft)");
  return {
    index: p.index, name: p.name, position: p.position, overall: p.overall, dev: p.dev,
    year: nextYear, classRank: classRank(nextYear), finalYear: nextYear === "Senior", tags
  };
}

function groupByRoom(entries) {
  const byRoom = Object.fromEntries(ROOM_ORDER.map(r => [r, []]));
  for (const e of entries) {
    const room = roomOf(e.position);
    if (room) byRoom[room].push(e);
  }
  return byRoom;
}

export function projectLeague(d, settings) {
  const next = new Map(), cur = new Map();
  for (const t of d.teams.keys()) { next.set(t, []); cur.set(t, []); }

  for (const p of d.players) {
    const nt = nextSeasonTeam(p, d.stage);
    if (nt !== null && next.has(nt)) next.get(nt).push(entry(d, p, projects(d.stage) ? nextClass(p) : p.schoolYear, nt));
    const ct = currentSeasonTeam(p);
    if (ct !== null && cur.has(ct)) {
      cur.get(ct).push({ index: p.index, name: p.name, position: p.position, overall: p.overall, classRank: classRank(p.schoolYear),
        year: p.schoolYear, staying: nt === ct, reason: nt === ct ? null : (p.isTransfer && p.destination !== null ? `Portal → ${d.teamName(p.destination)}` : departureReason(p)) });
    }
  }

  const teams = new Map();
  for (const team of d.teams.values()) {
    const starters = startersFor(team, settings);
    const rooms = assignRoles(groupByRoom(next.get(team.index)), starters, settings.roles);
    const nowRooms = assignRoles(groupByRoom(cur.get(team.index)), starters, settings.roles);
    const needs = {};
    for (const room of ROOM_ORDER) {
      const S = starters[room] ?? 0;
      if (!S) continue;
      const nowStarters = nowRooms[room].filter(e => e.role === "Starter");
      const lost = nowStarters.filter(e => !e.staying);
      const newStarters = rooms[room].filter(e => e.role === "Starter" && e.tags.some(t => /recruit|Transfer from/.test(t)));
      needs[room] = {
        slots: S,
        lost: lost.map(e => ({ name: e.name, overall: e.overall, reason: e.reason })),
        returning: nowStarters.length - lost.length,
        nowStarterOveralls: nowStarters.map(e => e.overall),
        filledByIncoming: newStarters.map(e => ({ name: e.name, overall: e.overall, tag: e.tags[0] })),
        open: Math.max(0, lost.length - newStarters.length)
      };
    }
    const total = (k) => Object.values(needs).reduce((s, n) => s + (Array.isArray(n[k]) ? n[k].length : n[k]), 0);
    teams.set(team.index, {
      teamIndex: team.index, team: team.name, offScheme: team.offScheme, defScheme: team.defScheme,
      starters, rooms, needs,
      rosterNextSeason: next.get(team.index).length,
      startersLost: total("lost"), startersFilled: total("filledByIncoming"), openSlots: total("open")
    });
  }
  return { projects: projects(d.stage), teams };
}

// Role a player would have at a team next season (for portal players / what-ifs).
export function roleAtTeam(d, league, playerIndex, teamIndex, settings) {
  const p = d.playerByIndex.get(playerIndex);
  const proj = league.teams.get(teamIndex);
  if (!p || !proj) throw new Error("Unknown player or team.");
  const room = roomOf(p.position);
  if (!room) return { room: null, role: "No room for this position" };
  const others = proj.rooms[room].filter(e => e.index !== p.index).map(e => ({ ...e }));
  const me = entry(d, p, projects(d.stage) ? nextClass(p) : p.schoolYear, teamIndex);
  const byRoom = { [room]: [...others, me] };
  // OL swing depends on the whole line, so include the other OL rooms when needed.
  if (OL_ROOMS.has(room)) for (const r of OL_ROOMS) if (r !== room) byRoom[r] = proj.rooms[r].map(e => ({ ...e }));
  assignRoles(byRoom, proj.starters, settings.roles);
  const ahead = byRoom[room].filter(e => e.rank < me.rank).map(e => ({ name: e.name, overall: e.overall, year: e.year, role: e.role }));
  return {
    player: p.name, position: p.position, overall: p.overall, year: me.year, team: proj.team, room,
    role: me.role, rank: me.rank + 1, starters: proj.starters[room] ?? 0, pathToStart: me.pathToStart, ahead,
    need: proj.needs[room] || null
  };
}
