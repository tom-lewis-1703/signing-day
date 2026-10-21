// Usage: node tools/capacity-check.mjs "<Signing Day save>"
// Signing Day capacity: do AI teams have room for the uncommitted transfers?
// Read-only. Simulates the planned recruit cleanup (Pass 0) without writing anything.
import { Session } from "../lib/session.mjs";
import { roomOf } from "../lib/depth-chart.mjs";

const CAPS = { QB: 5, HB: 6, FB: 1, WR: 11, TE: 5, OT: 8, OG: 8, C: 4, EDGE: 8, DT: 8, LB: 12, CB: 9, S: 8, K: 2, P: 2 };
const LIMIT = 85;
const s = new Session();
await s.open(process.argv[2]);
const d = s.d, L = s.getLeague();
const kansas = s.userTeam.teamIndex;

const uncommitted = d.players.filter(p => p.isTransfer && !p.transferCommitted);
const isRecruitTag = e => e.tags.some(t => /recruit/.test(t));
const devOf = i => d.playerByIndex.get(i).dev;

const sum = { teams: 0, rosterNow: 0, over85: 0, overflow: 0, room85Before: 0,
  cutSub60: 0, cutCap: 0, room85After: 0, capRoomTotal: 0, placeable: 0 };
const capRoomByPos = Object.fromEntries(Object.keys(CAPS).map(k => [k, 0]));
const overCapRealByPos = Object.fromEntries(Object.keys(CAPS).map(k => [k, 0]));

for (const proj of L.teams.values()) {
  if (proj.teamIndex === kansas) continue;
  sum.teams++;
  const rooms = Object.fromEntries(Object.entries(proj.rooms).map(([r, l]) => [r, [...l]]));
  const count = () => Object.values(rooms).reduce((a, l) => a + l.length, 0);
  const n0 = count();
  sum.rosterNow += n0;
  if (n0 > LIMIT) { sum.over85++; sum.overflow += n0 - LIMIT; }
  sum.room85Before += Math.max(0, LIMIT - n0);

  // Pass 0a: un-sign recruits under 60 unless Star/Elite.
  for (const r of Object.keys(rooms)) {
    const keep = rooms[r].filter(e => !(isRecruitTag(e) && e.overall < 60 && !/Star|Elite/.test(devOf(e.index))));
    sum.cutSub60 += rooms[r].length - keep.length;
    rooms[r] = keep;
  }
  // Pass 0b: position caps, lowest-rated incoming recruits first; real players never removed.
  for (const [r, cap] of Object.entries(CAPS)) {
    const list = rooms[r] || [];
    let over = list.length - cap;
    if (over <= 0) continue;
    const recruits = list.filter(isRecruitTag).sort((a, b) => a.overall - b.overall);
    const cut = recruits.slice(0, over);
    sum.cutCap += cut.length;
    rooms[r] = list.filter(e => !cut.includes(e));
    over -= cut.length;
    if (over > 0) overCapRealByPos[r] += over;
  }
  const n1 = count();
  const room85 = Math.max(0, LIMIT - n1);
  sum.room85After += room85;
  let capRoom = 0;
  for (const [r, cap] of Object.entries(CAPS)) {
    const free = Math.max(0, cap - (rooms[r] || []).length);
    capRoomByPos[r] += free;
    capRoom += free;
  }
  sum.capRoomTotal += capRoom;
  sum.placeable += Math.min(room85, capRoom);
}

const needByPos = Object.fromEntries(Object.keys(CAPS).map(k => [k, 0]));
for (const p of uncommitted) { const r = roomOf(p.position); if (r) needByPos[r]++; }

console.log(`Signing Day: ${uncommitted.length} uncommitted transfers; ${sum.teams} AI teams (Kansas excluded)`);
console.log(JSON.stringify(sum, null, 1));
console.log("\nBy position: uncommitted transfers vs free cap spots across AI teams after cleanup");
for (const r of Object.keys(CAPS)) console.log(`  ${r.padEnd(4)} transfers ${String(needByPos[r]).padStart(4)} | free cap spots ${String(capRoomByPos[r]).padStart(4)}${overCapRealByPos[r] ? ` | real players already over cap: ${overCapRealByPos[r]}` : ""}`);
const bands = [[85, 99], [80, 84], [75, 79], [70, 74], [0, 69]];
console.log("\nUncommitted transfers by OVR: " + bands.map(([a, b]) => `${a}-${b}: ${uncommitted.filter(p => p.overall >= a && p.overall <= b).length}`).join(", "));
