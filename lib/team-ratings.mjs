import { TEAM_RATING_FIELDS, TEAM_TABLE_UID } from "./dynasty.mjs";
import { nextSeasonTeam, roomOf, startersFor } from "./depth-chart.mjs";
import { overallAtArchetype, RATING_FIELDS } from "./ratings-model.mjs";

export const TEAM_RATINGS_MODEL = "Team ratings v2";
const SIDES = { offense: ["QB", "HB", "FB", "WR", "TE", "OT", "OG", "C"], defense: ["EDGE", "DT", "LB", "CB", "S"] };
const OL_FAMILY = { OT: "OT", OG: "G", C: "C" };
const REPLACEMENT = 40;
const round = n => Math.max(0, Math.min(99, Math.round(n)));
const average = values => values.reduce((a, b) => a + b, 0) / values.length;

function substitute(player, from, to) {
  if (from === to || !OL_FAMILY[from] || !OL_FAMILY[to]) return null;
  const penalty = [from, to].includes("OT") && [from, to].includes("C") ? 5 : 3;
  const archetype = `${OL_FAMILY[to]}_${player.archetype?.split("_").slice(1).join("_")}`;
  const source = player.attributes && overallAtArchetype(player.archetype, player.attributes);
  const target = player.attributes && overallAtArchetype(archetype, player.attributes);
  // Anchor the positional model to the saved OVR. Never grant a speculative boost.
  const positionAdjustment = Number.isFinite(source) && Number.isFinite(target) ? Math.min(0, target - source) : 0;
  return { ...player, room: to, sourceRoom: from, sourceOverall: player.overall, penalty, positionAdjustment,
    positionalModel: Number.isFinite(source) && Number.isFinite(target),
    overall: round(player.overall + positionAdjustment - penalty) };
}

// Reserve native starters/backups first, then fill holes with unused compatible
// linemen. These assignments are calculation-only; no position/depth-chart writes.
export function calculateTeamRatings(rooms, starters) {
  const breakdown = {};
  const raw = {};
  const summary = {};
  for (const [side, keys] of Object.entries(SIDES)) {
    if (keys.some(key => !Number.isInteger(starters[key] ?? 0) || (starters[key] ?? 0) < 0) ||
        keys.reduce((sum, key) => sum + (starters[key] ?? 0), 0) !== 11) {
      throw new Error(`Configure exactly 11 ${side} starter slots using nonnegative integers.`);
    }
    const used = new Set();
    const depth = keys.filter(key => starters[key] > 0).map(room => {
      const slots = starters[room];
      const players = [...(rooms[room] ?? [])].sort((a, b) => b.overall - a.overall || a.index - b.index);
      const first = players.slice(0, slots), second = players.slice(slots, slots * 2);
      [...first, ...second].forEach(p => used.add(p.index));
      return { room, slots, first, second };
    });
    for (const level of ["first", "second"]) for (const room of depth) {
      while (room[level].length < room.slots) {
        const candidates = keys.flatMap(from => (rooms[from] ?? []).filter(p => !used.has(p.index))
          .map(p => substitute(p, from, room.room)).filter(p => p && p.overall > REPLACEMENT))
          .sort((a, b) => b.overall - a.overall || a.index - b.index);
        if (!candidates.length) break;
        room[level].push(candidates[0]);
        used.add(candidates[0].index);
      }
    }
    breakdown[side] = depth.map(({ room, slots, first, second }) => {
      const starterAverage = average(Array.from({ length: slots }, (_, i) => first[i]?.overall ?? REPLACEMENT));
      const backupAverage = average(Array.from({ length: slots }, (_, i) => second[i]?.overall ?? REPLACEMENT));
      return { room, slots, weight: slots * (room === "QB" ? 2 : 1), starterAverage, backupAverage,
        score: .8 * starterAverage + .2 * backupAverage, missingStarters: slots - first.length, missingBackups: slots - second.length,
        starters: first, backups: second };
    });
    const weight = breakdown[side].reduce((sum, room) => sum + room.weight, 0);
    if (!weight) throw new Error(`No ${side} starter slots configured.`);
    raw[side] = breakdown[side].reduce((sum, room) => sum + room.score * room.weight, 0) / weight;
    for (const room of breakdown[side]) {
      room.weightShare = room.weight / weight;
      room.starterContribution = .8 * room.starterAverage * room.weightShare;
      room.backupContribution = .2 * room.backupAverage * room.weightShare;
      room.contribution = room.starterContribution + room.backupContribution;
    }
    const starterScore = breakdown[side].reduce((sum, room) => sum + room.starterAverage * room.weightShare, 0);
    const backupScore = breakdown[side].reduce((sum, room) => sum + room.backupAverage * room.weightShare, 0);
    summary[side] = { starterScore, backupScore, rawScore: raw[side], depthAdjustment: raw[side] - starterScore,
      missingStarters: breakdown[side].reduce((sum, room) => sum + room.missingStarters, 0),
      missingBackups: breakdown[side].reduce((sum, room) => sum + room.missingBackups, 0) };
  }
  const offense = round(raw.offense), defense = round(raw.defense);
  return { ratings: { overall: round((offense + defense) / 2), offense, defense }, breakdown, summary };
}

export function buildTeamRatingsPlan(d, settings, { rosterBasis = d.stage.supported ? "upcoming" : "current" } = {}) {
  if (!["current", "upcoming"].includes(rosterBasis)) throw new Error("Choose current or upcoming rosters.");
  if (rosterBasis === "upcoming" && !d.stage.supported) throw new Error("Upcoming rosters are available during the offseason before Preseason.");
  const rosters = new Map([...d.teams.keys()].map(index => [index, []]));
  let countedPlayers = 0;
  for (const p of d.players) {
    const index = rosterBasis === "upcoming" ? nextSeasonTeam(p, d.stage) : p.team, room = roomOf(p.position);
    if (!rosters.has(index) || !room) continue;
    if (!Number.isFinite(p.overall) || p.overall < 0 || p.overall > 100) throw new Error(`Invalid player OVR for ${p.name}.`);
    rosters.get(index).push({ index: p.index, name: p.name, position: p.position, overall: p.overall, room,
      archetype: p.archetype, ...(OL_FAMILY[room] && p.record ? { attributes: RATING_FIELDS.map(field => Number(p.record[field])) } : {}) });
    countedPlayers++;
  }
  const teams = [...d.teams.values()].map(team => {
    const players = rosters.get(team.index), starters = startersFor(team, settings);
    const rooms = Object.fromEntries(Object.keys(SIDES).flatMap(side => SIDES[side]).map(room => [room, players.filter(p => p.room === room)]));
    const before = Object.fromEntries(Object.entries(TEAM_RATING_FIELDS).map(([key, field]) => {
      const value = Number(team.record[field]);
      if (!Number.isInteger(value) || value < 0 || value > 127) throw new Error(`Missing or invalid ${field} for ${team.name}.`);
      return [key, value];
    }));
    // Only wholly empty schools are placeholders. A populated school's missing
    // side receives replacement scores and an explicit warning in the preview.
    const skipped = players.length === 0;
    const missingSides = Object.entries(SIDES).filter(([, keys]) => !keys.some(room => starters[room] > 0 && rooms[room].length)).map(([side]) => side);
    const computed = skipped ? null : calculateTeamRatings(rooms, starters);
    return { index: team.index, row: team.record.index, name: team.name, short: team.short, before,
      after: computed?.ratings ?? before, changed: !!computed && Object.keys(before).some(key => before[key] !== computed.ratings[key]),
      rosterCount: players.length, breakdown: computed?.breakdown ?? null, summary: computed?.summary ?? null,
      note: skipped ? "Skipped: no eligible roster. Stored ratings kept." : null,
      warnings: !skipped && missingSides.length ? [`No eligible ${missingSides.join(" or ")} players; empty slots count as 40 OVR.`] : [],
      schemeFallback: !starters._schemeKnown.offense || !starters._schemeKnown.defense };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { tool: "team-ratings", model: TEAM_RATINGS_MODEL, rosterBasis,
    teams, counts: { teams: teams.length, changed: teams.filter(t => t.changed).length, skipped: teams.filter(t => t.note).length,
      players: d.players.length, countedPlayers } };
}

// Compare every table's raw bytes with a copy of the backup changed only at the
// three reviewed rating fields. This also detects extra writes in a rated row.
export async function verifyTeamRatingsWrite(original, saved, plan) {
  const problems = [];
  const a = original.getTableByUniqueId(TEAM_TABLE_UID), b = saved.getTableByUniqueId(TEAM_TABLE_UID);
  const fields = ["TeamIndex", ...Object.values(TEAM_RATING_FIELDS)];
  await Promise.all([a.readRecords(fields), b.readRecords(fields)]);
  const expected = Buffer.from(a.data);
  for (const team of plan.teams) {
    const old = a.records[team.row], next = b.records[team.row];
    if (!old || !next || old.isEmpty || next.isEmpty || Number(old.TeamIndex) !== team.index || Number(next.TeamIndex) !== team.index) {
      problems.push(`${team.name}: team record changed identity.`); continue;
    }
    for (const [key, field] of Object.entries(TEAM_RATING_FIELDS)) {
      if (Number(old[field]) !== team.before[key]) problems.push(`${team.name}: backup ${key} differs from preview.`);
      if (Number(next[field]) !== team.after[key]) problems.push(`${team.name}: saved ${key} differs from preview.`);
      if (team.changed) old[field] = team.after[key];
    }
    if (team.changed) old.hexData.copy(expected, a.header.table1StartIndex + team.row * a.header.record1Size);
  }
  const byId = new Map(saved.tables.map(table => [table.header.tableId, table]));
  if (original.tables.length !== saved.tables.length) problems.push("The table count changed.");
  for (const table of original.tables) {
    const next = byId.get(table.header.tableId), wanted = table === a ? expected : table.data;
    if (!next || !wanted.equals(next.data)) problems.push(`${table.name} (table ${table.header.tableId}) contains changes beyond the reviewed team ratings.`);
  }
  return problems;
}
