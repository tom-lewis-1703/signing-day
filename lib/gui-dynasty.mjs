// Read-only presentation data. This module never edits records or builds a plan.
import path from 'node:path';
import { teamArt, playerPortrait, playerCard } from './gui-plan.mjs';
import { RATING_FIELDS } from './ratings-model.mjs';
import { nextClass } from './dynasty.mjs';
import { ROOM_ORDER, roomOf, nextSeasonTeam } from './depth-chart.mjs';

const school = (d, index) => {
  const t = d.teams.get(index);
  return t ? { index: t.index, name: t.name, short: t.short, colors: t.colors,
    ...teamArt(t.name, t.record.LongName) } : null;
};
const row = p => ({ index: p.index, playerIndex: p.index, name: p.name, pos: p.position,
  ovr: p.overall, year: p.schoolYear, dev: p.dev.replace('College_', ''), stars: p.stars,
  portrait: playerPortrait(p.head), archetype: p.archetype, stage: p.recruitStage,
  nationalRank: p.nationalRank, positionRank: p.positionRank,
  fromTeam: p.prevTeam, destination: p.destination });
const order = (a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name);
const ratings = t => ({ overall: Number(t.record.TEAM_RATINGOVR),
  offense: Number(t.record.TEAM_RATINGOFF), defense: Number(t.record.TEAM_RATINGDEF) });

export function dynastyView(session) {
  const d = session.d;
  const teams = [...d.teams.values()].map(t => {
    const roster = d.players.filter(p => p.team === t.index);
    const recruits = d.players.filter(p => p.isIncomingRecruit && p.destination === t.index);
    const transfers = d.players.filter(p => p.isTransfer && p.destination === t.index);
    return { ...school(d, t.index), ratings: ratings(t), rosterCount: roster.length,
      recruitCount: recruits.length, transferCount: transfers.length,
      topPlayers: roster.map(row).sort(order).slice(0, 3) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { save: { fileName: path.basename(d.filePath), stage: d.stage },
    userTeam: school(d, session.userTeam.teamIndex), teams,
    counts: { teams: teams.length, rostered: d.players.filter(p => d.teams.has(p.team)).length,
      recruits: d.players.filter(p => p.isIncomingRecruit && p.destination !== null).length,
      transfers: d.players.filter(p => p.isTransfer).length } };
}

export function teamPage(session, index, raw = null) {
  const d = session.d, t = d.teams.get(Number(index));
  if (!t) return null;
  const roster = d.players.filter(p => p.team === t.index).map(row).sort(order);
  const recruits = d.players.filter(p => p.isIncomingRecruit && (p.destination === t.index ||
    p.boardInterest.some(b => b.teamIndex === t.index))).map(p => ({ ...row(p),
      committedHere: p.destination === t.index,
      committedTo: school(d, p.destination),
      offered: p.boardInterest.find(b => b.teamIndex === t.index)?.offered ?? false,
      plannedRelease: raw?.cuts.some(c => c.index === p.index && c.teamIndex === t.index) ?? false })).sort((a, b) => Number(b.committedHere) - Number(a.committedHere) || order(a, b));
  const transfersIn = d.players.filter(p => p.isTransfer && p.destination === t.index).map(row).sort(order);
  const transfersOut = d.players.filter(p => p.isTransfer && p.prevTeam === t.index ||
    p.enteringPortal && p.team === t.index).map(row).sort(order);
  const projected = raw?.teams.find(x => x.teamIndex === t.index);
  const refs = projected ? new Set(projected.roster) : null;
  const upcoming = d.players.filter(p => refs ? refs.has(p.ref) : nextSeasonTeam(p, d.stage) === t.index)
    .map(p => ({ ...row(p), year: d.stage.supported ? nextClass(p) : p.schoolYear })).sort(order);
  const rooms = Object.fromEntries(ROOM_ORDER.map(room => [room, upcoming.filter(p => roomOf(p.pos) === room)]));
  return { ...school(d, t.index), userTeam: t.index === session.userTeam.teamIndex,
    ratings: ratings(t), prestige: t.prestige, schemes: { offense: t.offScheme, defense: t.defScheme },
    grades: t.grades, roster, recruits, transfersIn, transfersOut, upcoming, rooms,
    roomOrder: ROOM_ORDER, projected: !!projected,
    rosterBasis: projected ? 'Proposed roster' : d.stage.supported ? 'Upcoming roster' : 'Current roster' };
}

export function profile(session, index, raw = null, state = null) {
  const d = session.d, p = d.playerByIndex.get(Number(index));
  if (!p) return null;
  const team = school(d, p.team), committed = school(d, p.destination);
  const base = { ...row(p), initials: p.name.split(/\s+/).map(x => x[0]).slice(0, 2).join(''),
    status: p.isTransfer ? 'TRANSFER' : p.isIncomingRecruit ? 'RECRUIT' : 'ROSTER',
    from: school(d, p.prevTeam), to: committed ?? team, school: team ?? committed,
    jersey: p.jersey, height: p.height, weight: p.weight, hometown: p.homeTown,
    homeState: p.homeState, redshirt: p.redshirt, archetype: p.archetype,
    ratings: RATING_FIELDS.map(field => ({ field, label: field.replace(/^PLYR_/, '').replace(/Rating$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'), value: Number(p.record[field]) })),
    recruiting: { stars: p.stars, nationalRank: p.nationalRank, positionRank: p.positionRank,
      stage: p.recruitStage, dealbreaker: p.dealbreaker, pitch: p.pitch,
      schools: p.recruitRecord ? d.topSchools(p.recruitRecord).map(s => ({ ...s, school: school(d, s.teamIndex) })).filter(s => s.school) : [] },
    facts: { archetype: p.archetype, redshirt: p.redshirt, hometown: p.homeTown,
      homeState: p.homeState, development: p.dev.replace('College_', '') },
    why: '', opportunity: null, undos: [] };
  return raw && state ? { ...base, ...playerCard(session, raw, state, p.index) } : base;
}
