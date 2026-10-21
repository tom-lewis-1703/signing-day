// A working copy of the next-season projection that changes as players are signed or cut,
// so team needs (fit.mjs roomNeeds) and every later player's Top 10 (destinations) see the
// new rosters. League-wide baselines (average starters, prestige targets, team strength,
// room averages) stay fixed at the original projection's values.
import { assignRoles, roomOf } from "./depth-chart.mjs";
import { starterLevels, prestigeTargets } from "./fit.mjs";
import { teamStrength, nowRoomAverages } from "./destinations.mjs";

export function liveLeague(d, league) {
  starterLevels(league); prestigeTargets(d, league); teamStrength(league); nowRoomAverages(league);
  const teams = new Map();
  for (const [ti, proj] of league.teams) {
    const { _needs, ...rest } = proj;
    const rooms = Object.fromEntries(Object.entries(proj.rooms).map(([r, list]) => [r, list.map(e => ({ ...e, tags: [...e.tags] }))]));
    teams.set(ti, { ...rest, rooms });
  }
  return { ...league, teams };   // keeps the cached baselines (_levels, _strength, ...)
}

function reassign(proj, settings) {
  assignRoles(proj.rooms, proj.starters, settings.roles);
  delete proj._needs;
}

export function addToTeam(live, teamIndex, entry, settings) {
  const proj = live.teams.get(teamIndex);
  proj.rooms[roomOf(entry.position)].push(entry);
  proj.rosterNextSeason++;
  reassign(proj, settings);
}

export function removeFromTeam(live, teamIndex, index, position, settings) {
  const proj = live.teams.get(teamIndex);
  const room = roomOf(position);
  proj.rooms[room] = proj.rooms[room].filter(e => e.index !== index);
  proj.rosterNextSeason--;
  reassign(proj, settings);
}
