// Offers report (task 2 piece 1): how the game's recruiting-board offers line up with our Top 10s, read-only.
//   node tools/offers-report.mjs <save> [--examples=N]
import { Session } from "../lib/session.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const examples = Number((args.find(a => a.startsWith("--examples=")) || "=8").split("=")[1]);

const session = new Session();
const info = await session.open(file);
const d = session.d;
console.log(`${info.fileName}: ${info.stage.label} | open ${info.openMs} ms`);

const transfers = d.players.filter(p => p.isTransfer);
const open = transfers.filter(p => !p.transferCommitted);
const onBoard = transfers.filter(p => p.boardInterest.length);
const offered = open.filter(p => p.boardInterest.some(o => o.offered));
const boards = new Set([...d.offersByRecruitRef.values()].flat().map(o => o.teamIndex));
const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : "-";
console.log(`transfers ${transfers.length} (uncommitted ${open.length}) | on any board ${onBoard.length} | uncommitted with an offer ${offered.length} | schools with a board ${boards.size}`);

const c = { inTop10: 0, ourNo1: 0, inGameList: 0, ownNo1: 0, nearCommit: 0, userTop3: 0 };
const rows = [];
const user = session.settings.userTeam;
for (const p of offered) {
  const r = session.destinations(p.index);
  const top = r.top10.map(t => t.teamIndex);
  const list = d.topSchools(p.recruitRecord).map(s => s.teamIndex);
  const offers = p.boardInterest.filter(o => o.offered);
  const best = offers[0];
  const inTop = offers.filter(o => top.includes(o.teamIndex));
  if (inTop.length) c.inTop10++;
  if (offers.some(o => o.teamIndex === top[0])) c.ourNo1++;
  if (offers.some(o => list.includes(o.teamIndex))) c.inGameList++;
  if (offers.some(o => o.teamIndex === list[0])) c.ownNo1++;
  if (p.commitScore && best.influence >= 0.75 * p.commitScore) c.nearCommit++;
  if (r.top10.slice(0, 3).some(t => t.userTeam)) c.userTop3++;
  rows.push({ p, offers, top, best });
}
const n = offered.length;
console.log(`of ${n} uncommitted with an offer: an offering school in our Top 10 ${c.inTop10} (${pct(c.inTop10, n)}) | is our #1 ${c.ourNo1} (${pct(c.ourNo1, n)}) | on his in-game list ${c.inGameList} (${pct(c.inGameList, n)}) | is his in-game #1 ${c.ownNo1} (${pct(c.ownNo1, n)})`);
console.log(`  best offer influence ≥ 75% of his CommitScore ${c.nearCommit} (${pct(c.nearCommit, n)}) | user team in our top 3 ${c.userTop3}`);
const offersPer = rows.map(r => r.offers.length);
console.log(`  offers per player: 1 → ${offersPer.filter(x => x === 1).length}, 2 → ${offersPer.filter(x => x === 2).length}, 3+ → ${offersPer.filter(x => x >= 3).length}`);

rows.sort((a, b) => (a.p.nationalRank || 9999) - (b.p.nationalRank || 9999));
for (const { p, offers, top, best } of rows.slice(0, examples)) {
  const o = offers.map(x => `${d.teamName(x.teamIndex)} ${x.influence}${top.includes(x.teamIndex) ? ` (our #${top.indexOf(x.teamIndex) + 1})` : ""}`).join(", ");
  console.log(`  #${p.nationalRank} ${p.name} ${p.position} ${p.overall} · CommitScore ${p.commitScore} · offers: ${o} · our #1 ${d.teamName(top[0])}`);
}
