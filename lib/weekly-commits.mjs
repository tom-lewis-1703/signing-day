// Task 2: weekly commits during the portal (Weeks 1–4), read-only plan. The tool commits
// enough transfers to reach this week's pace (the game's own commits count), in a chance-based
// order (stars and clear favorites likelier), each to the best school on his live Top 10 with room (a school that offered him
// in-game first) within his top `maxSpot`; otherwise he waits. Never a player on the user
// team's recruiting board or with the user team in his top 3; no cuts, no recruit cleanup.
import { roomOf } from "./depth-chart.mjs";
import { destinations } from "./destinations.mjs";
import { liveLeague, addToTeam } from "./live-league.mjs";
import { BOARD_SLOTS, meFor, roomAt, planRecruitCleanup } from "./signing-day.mjs";

// Priority parts, each 0–1: favorite = how far his #1 is ahead of his #2 (percentile among
// this week's candidates), rank = national transfer rank (1 = top), offer = best in-game
// offer's influence / his CommitScore.
function priorityParts(cands) {
  const byMargin = [...cands].sort((a, b) => a.margin - b.margin);
  byMargin.forEach((c, i) => { c.favorite = cands.length > 1 ? i / (cands.length - 1) : 1; });
  const worst = Math.max(1, ...cands.map(c => c.p.nationalRank || 0));
  for (const c of cands) c.rank = c.p.nationalRank ? 1 - (c.p.nationalRank - 1) / worst : 0;
}

// A fixed number in (0, 1) per player, season and week (FNV-1a hash).
function draw(...parts) {
  let h = 2166136261;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) + 0.5) / 4294967296;
}

export function planWeekly(d, league, settings, weights = settings.weekly.weights) {
  const started = Date.now();
  const wk = settings.weekly;
  const pl = settings.signingDay.placement;
  const pace = wk.pace[d.stage.id];
  if (pace == null) return { available: false, stage: d.stage.label };
  const userTeam = d.findTeamByName(settings.userTeam)?.index ?? null;
  // softLimits: no position caps or roster limit during the weeks (Signing Day trims); board slots and the transfers-per-room limit stay.
  const room0 = wk.softLimits ? { ...pl, caps: {}, rosterMax: Infinity } : pl;
  const live = liveLeague(d, league);

  // Board slots used: players (recruits and transfers) committed to each school, as the board
  // will be after Signing Day's recruit cleanup (recruits it would un-sign don't count).
  const unsign = new Set(planRecruitCleanup(d, league, settings).unsign.map(e => e.index));
  const board = new Map();
  for (const p of d.players) if ((p.isTransfer || p.isIncomingRecruit) && p.destination !== null && !unsign.has(p.index)) board.set(p.destination, (board.get(p.destination) || 0) + 1);
  const states = new Map();
  for (const [ti, proj] of live.teams) if (ti !== userTeam) states.set(ti, { teamIndex: ti, team: proj.team, proj, board: board.get(ti) || 0, realCuts: 0 });

  const transfers = d.players.filter(p => p.isTransfer);
  const gameCommits = transfers.filter(p => p.transferCommitted).length;
  const target = Math.round(pace * transfers.length);
  const quota = Math.max(0, target - gameCommits);

  // Candidates: uncommitted transfers with a room, scored on the starting Top 10s.
  const cands = [];
  let userTop3 = 0, userBoard = 0;
  for (const p of transfers) {
    if (p.transferCommitted || !roomOf(p.position)) continue;
    if (p.boardInterest.some(o => o.teamIndex === userTeam)) { userBoard++; continue; }   // the user is recruiting him
    const r = destinations(d, live, p.index, settings);
    if (!r.top10.length) continue;
    if (r.top10.slice(0, wk.userTopN).some(t => t.userTeam)) { userTop3++; continue; }
    const [a, b] = r.top10;
    const margin = b ? (a.combined - b.combined) / Math.max(a.combined, 1) : 1;
    const best = p.boardInterest.find(o => o.offered);
    const offer = best && p.commitScore ? Math.min(1, best.influence / p.commitScore) : 0;
    cands.push({ p, margin, offer, startNo1: a.teamIndex });
  }
  priorityParts(cands);
  // Chance-based order: a weighted draw (key = u^(1/chance)), so likelier players tend to go
  // first but nobody is certain. u is fixed per player and week, so the same save gives the same plan.
  for (const c of cands) {
    c.priority = weights.favorite * c.favorite + weights.rank * c.rank + weights.offer * c.offer;
    c.chance = wk.baseChance + c.priority;
    c.key = Math.pow(draw(c.p.index, d.stage.seasonYear, d.stage.id), 1 / c.chance);
  }
  cands.sort((a, b) => b.key - a.key);

  // Commit in priority order on the live league until the quota is met.
  const commits = [], noRoom = [];
  for (const c of cands) {
    if (commits.length >= quota) break;
    const p = c.p;
    const r = destinations(d, live, p.index, settings);
    if (r.top10.slice(0, wk.userTopN).some(t => t.userTeam)) continue;
    const room = roomOf(p.position);
    const me = meFor(d, p, pl, p.prevTeam);
    const offered = new Set(p.boardInterest.filter(o => o.offered).map(o => o.teamIndex));
    const order = [...r.top10.entries()].filter(([i]) => i < wk.maxSpot).sort(([i, a], [j, b]) => offered.has(b.teamIndex) - offered.has(a.teamIndex) || i - j);
    let done = null;
    for (const [i, t] of order) {
      const state = states.get(t.teamIndex);
      if (!state || state.board >= BOARD_SLOTS) continue;
      const fit = roomAt(state, room, me, room0, settings.roles, settings.fit);   // no cuts: null when full
      if (!fit) continue;
      addToTeam(live, state.teamIndex, me, settings);
      state.board++;
      done = { index: p.index, name: p.name, position: p.position, overall: p.overall, max: d.maxOverall(p), stars: p.stars, nationalRank: p.nationalRank,
        from: d.teamName(p.prevTeam), teamIndex: state.teamIndex, team: state.team, how: `${offered.has(t.teamIndex) ? "Offered, " : ""}Top 10 #${i + 1}`,
        topIndex: i, role: fit.rw.role, gameNo1: d.topSchools(p.recruitRecord)[0]?.teamIndex ?? null,
        favorite: c.favorite, rank: c.rank, offer: c.offer, margin: c.margin };
      break;
    }
    if (done) commits.push(done); else noRoom.push(p.name);
  }
  return { available: true, live, stage: d.stage.label, pace, transfers: transfers.length, gameCommits, target, quota, candidates: cands.length,
    userTop3, userBoard, commits, noRoom, weights, ms: Date.now() - started };
}

// Weekly interest update (from settings.weekly.listsFrom): after this week's commits, each
// uncommitted transfer's in-game list becomes his live Top 10. Kept as they are: the user
// team's entry (never added or removed) and schools with him on their recruiting board (their
// influence is the game's commit clock). The other slots go to our Top 10 in order, with his
// existing influence numbers high to low, so no school rises above his current top value.
// Players on the user team's board are left alone; a list keeps its length.
export function planListUpdates(d, settings, weekly) {
  const wk = settings.weekly;
  const order = ["week-1", "week-2", "week-3", "week-4"];
  if (!weekly.available || order.indexOf(d.stage.id) < order.indexOf(wk.listsFrom)) return { available: false, stage: d.stage.label };
  const userTeam = d.findTeamByName(settings.userTeam)?.index ?? null;
  const committed = new Set(weekly.commits.map(e => e.index));
  const updates = [];
  let unchanged = 0, userBoard = 0;
  for (const p of d.players) {
    if (!p.isTransfer || p.transferCommitted || committed.has(p.index)) continue;
    if (p.boardInterest.some(o => o.teamIndex === userTeam)) { userBoard++; continue; }
    const before = d.topSchools(p.recruitRecord);
    if (!before.length) continue;
    const onBoard = new Set(p.boardInterest.map(o => o.teamIndex));
    const keep = before.filter(x => x.teamIndex === userTeam || onBoard.has(x.teamIndex));
    const keepTeams = new Set(keep.map(x => x.teamIndex));
    const values = before.filter(x => !keepTeams.has(x.teamIndex)).map(x => x.influence).sort((a, b) => b - a);
    const ours = destinations(d, weekly.live, p.index, settings).top10.map(t => t.teamIndex).filter(ti => ti !== userTeam && !keepTeams.has(ti));
    const leftovers = before.filter(x => !keepTeams.has(x.teamIndex) && !ours.includes(x.teamIndex)).map(x => x.teamIndex);
    const fill = [...ours, ...leftovers].slice(0, values.length).map((teamIndex, i) => ({ teamIndex, influence: values[i] }));
    const after = [...keep.map(x => ({ teamIndex: x.teamIndex, influence: x.influence })), ...fill]
      .sort((a, b) => b.influence - a.influence);
    if (after.every((x, i) => x.teamIndex === before[i].teamIndex && x.influence === before[i].influence)) { unchanged++; continue; }
    updates.push({ index: p.index, name: p.name, position: p.position, overall: p.overall, before, after,
      kept: keep.length, replaced: after.filter(x => !before.some(y => y.teamIndex === x.teamIndex)).length });
  }
  return { available: true, updates, unchanged, userBoard };
}
