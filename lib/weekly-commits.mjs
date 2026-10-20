// Task 2: weekly commits during the portal (Weeks 1–4), read-only plan. The tool commits
// enough transfers to reach this week's pace (the game's own commits count), in priority
// order, each to the best school on his live Top 10 with room (a school that offered him
// in-game first) within his top `maxSpot`; otherwise he waits. Never while the user team is in his top 3; no cuts, no recruit cleanup.
import { roomOf } from "./depth-chart.mjs";
import { destinations } from "./destinations.mjs";
import { liveLeague, addToTeam } from "./live-league.mjs";
import { BOARD_SLOTS, meFor, roomAt } from "./signing-day.mjs";

// Priority parts, each 0–1: favorite = how far his #1 is ahead of his #2 (percentile among
// this week's candidates), rank = national transfer rank (1 = top), offer = best in-game
// offer's influence / his CommitScore.
function priorityParts(cands) {
  const byMargin = [...cands].sort((a, b) => a.margin - b.margin);
  byMargin.forEach((c, i) => { c.favorite = cands.length > 1 ? i / (cands.length - 1) : 1; });
  const ranked = cands.filter(c => c.p.nationalRank).length;
  for (const c of cands) c.rank = c.p.nationalRank ? 1 - (c.p.nationalRank - 1) / Math.max(ranked, 1) : 0;
}

export function planWeekly(d, league, settings, weights = settings.weekly.weights) {
  const started = Date.now();
  const wk = settings.weekly;
  const pl = settings.signingDay.placement;
  const pace = wk.pace[d.stage.id];
  if (pace == null) return { available: false, stage: d.stage.label };
  const userTeam = d.findTeamByName(settings.userTeam)?.index ?? null;
  const live = liveLeague(d, league);

  // Board slots used: players (recruits and transfers) committed to each school.
  const board = new Map();
  for (const p of d.players) if ((p.isTransfer || p.isIncomingRecruit) && p.destination !== null) board.set(p.destination, (board.get(p.destination) || 0) + 1);
  const states = new Map();
  for (const [ti, proj] of live.teams) if (ti !== userTeam) states.set(ti, { teamIndex: ti, team: proj.team, proj, board: board.get(ti) || 0, realCuts: 0 });

  const transfers = d.players.filter(p => p.isTransfer);
  const gameCommits = transfers.filter(p => p.transferCommitted).length;
  const target = Math.round(pace * transfers.length);
  const quota = Math.max(0, target - gameCommits);

  // Candidates: uncommitted transfers with a room, scored on the starting Top 10s.
  const cands = [];
  let userTop3 = 0;
  for (const p of transfers) {
    if (p.transferCommitted || !roomOf(p.position)) continue;
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
  for (const c of cands) c.priority = weights.favorite * c.favorite + weights.rank * c.rank + weights.offer * c.offer;
  cands.sort((a, b) => b.priority - a.priority || (a.p.nationalRank || 1e9) - (b.p.nationalRank || 1e9));

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
      const fit = roomAt(state, room, me, pl, settings.roles, settings.fit);   // no cuts: null when full
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
  return { available: true, stage: d.stage.label, pace, transfers: transfers.length, gameCommits, target, quota, candidates: cands.length,
    userTop3, commits, noRoom, weights, ms: Date.now() - started };
}
