// Step 5: Signing Day roster build (read-only plans; writing comes later).
//
// Recruit cleanup (Pass 0): every signed HS/JUCO recruit at a CPU team under
// signingDay.recruitCleanup.underOverall is un-signed, unless his dev trait is in keepDev
// and his max overall reaches the league's average next-season starter at his position
// (fit.mjs starterLevels). The user team (settings.userTeam) is never changed.
// Each team's committed-players board has BOARD_SLOTS slots, so freed board slots are the
// room for transfers placed later.
import { NO_TEAM } from "./dynasty.mjs";
import { roomOf } from "./depth-chart.mjs";
import { starterLevels } from "./fit.mjs";

export const BOARD_SLOTS = 35;

export function planRecruitCleanup(d, league, settings) {
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
    if (p.overall >= rc.underOverall) continue;
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
