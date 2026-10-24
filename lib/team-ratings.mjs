import { TEAM_RATING_FIELDS, TEAM_TABLE_UID } from "./dynasty.mjs";
import { nextSeasonTeam, roomOf, startersFor } from "./depth-chart.mjs";

export const TEAM_RATINGS_MODEL = "Team ratings v1";
const SIDES = { offense: ["QB", "HB", "FB", "WR", "TE", "OT", "OG", "C"], defense: ["EDGE", "DT", "LB", "CB", "S"] };
const REPLACEMENT = 40;
const round = n => Math.max(0, Math.min(99, Math.round(n)));
const average = values => values.reduce((a, b) => a + b, 0) / values.length;

// Rebuild an OVR-ranked two-deep in each position room, without editing the game's
// depth chart. Positions with no scheme slots do not affect the side's rating.
export function calculateTeamRatings(rooms, starters) {
  const breakdown = {};
  const raw = {};
  for (const [side, keys] of Object.entries(SIDES)) {
    breakdown[side] = keys.filter(key => starters[key] > 0).map(room => {
      const slots = starters[room];
      const players = [...(rooms[room] ?? [])].sort((a, b) => b.overall - a.overall || a.index - b.index);
      const first = players.slice(0, slots), second = players.slice(slots, slots * 2);
      const starterAverage = average(Array.from({ length: slots }, (_, i) => first[i]?.overall ?? REPLACEMENT));
      const backupAverage = average(Array.from({ length: slots }, (_, i) => second[i]?.overall ?? REPLACEMENT));
      return { room, slots, weight: slots * (room === "QB" ? 2 : 1), starterAverage, backupAverage,
        score: .8 * starterAverage + .2 * backupAverage, missingStarters: slots - first.length, missingBackups: slots - second.length,
        starters: first, backups: second };
    });
    const weight = breakdown[side].reduce((sum, room) => sum + room.weight, 0);
    if (!weight) throw new Error(`No ${side} starter slots configured.`);
    raw[side] = breakdown[side].reduce((sum, room) => sum + room.score * room.weight, 0) / weight;
  }
  const offense = round(raw.offense), defense = round(raw.defense);
  return { ratings: { overall: round((offense + defense) / 2), offense, defense }, breakdown };
}

export function buildTeamRatingsPlan(d, settings) {
  const rosters = new Map([...d.teams.keys()].map(index => [index, []]));
  let countedPlayers = 0;
  for (const p of d.players) {
    const index = nextSeasonTeam(p, d.stage), room = roomOf(p.position);
    if (!rosters.has(index) || !room) continue;
    if (!Number.isFinite(p.overall) || p.overall < 0 || p.overall > 100) throw new Error(`Invalid player OVR for ${p.name}.`);
    rosters.get(index).push({ index: p.index, name: p.name, position: p.position, overall: p.overall, room });
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
    // Unpopulated placeholder/FCS teams must keep their existing ratings.
    const skipped = Object.entries(SIDES).filter(([, keys]) => !keys.some(room => starters[room] > 0 && rooms[room].length)).map(([side]) => side);
    const computed = skipped.length ? null : calculateTeamRatings(rooms, starters);
    return { index: team.index, row: team.record.index, name: team.name, short: team.short, before,
      after: computed?.ratings ?? before, changed: !!computed && Object.keys(before).some(key => before[key] !== computed.ratings[key]),
      rosterCount: players.length, breakdown: computed?.breakdown ?? null,
      note: skipped.length ? `Skipped: no eligible ${skipped.join(" or ")} players.` : null,
      schemeFallback: !starters._schemeKnown.offense || !starters._schemeKnown.defense };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { tool: "team-ratings", model: TEAM_RATINGS_MODEL, rosterBasis: d.stage.supported ? "upcoming" : "current",
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
