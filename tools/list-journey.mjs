// Usage: node tools/list-journey.mjs "<folder with DYNASTY-WEEK1PORTALOPENSCOPY, -WEEK4PORTALCLOSESCOPY, -SIGNINGDAYCOPY, -PRESEASONCOPY>"
// Follows every Week 1 transfer through Week 4, Signing Day and Preseason:
// his in-game Top 10 at each stage, his commitment, and where he ended up.
import { Dynasty, NO_TEAM } from "../lib/dynasty.mjs";

const dir = process.argv[2];
const load = name => Dynasty.load(`${dir}/DYNASTY-${name}COPY`);
const [w1, w4, sd, pre] = await Promise.all(["WEEK1PORTALOPENS", "WEEK4PORTALCLOSES", "SIGNINGDAY", "PRESEASON"].map(load));

// Players keep their name and position; prevTeam separates duplicates.
const key = p => `${p.name}|${p.position}`;
const index = (d, filter) => {
  const m = new Map();
  for (const p of d.players) if (filter(p)) { const k = key(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
  return m;
};
const pick = (list, prev) => !list ? null : list.length === 1 ? list[0] : list.find(p => p.prevTeam === prev) || null;
const names = (d, ids) => ids.map(i => d.teamName(i));

const i4 = index(w4, p => p.isTransfer), iS = index(sd, p => p.isTransfer), iP = index(pre, () => true);
const transfers = w1.players.filter(p => p.isTransfer);

const c = {
  week1: transfers.length, tracked: 0,
  committedByWeek4: 0, w4CommitOnW1List: 0, w4CommitSlotOnW1: {},
  sdCommitted: 0, sdCommitOnW1List: 0, sdCommitSlotOnW1: {},
  endedOnTeam: 0, endedAtW1ListSchool: 0, endedAtOldSchool: 0, endedSlotOnW1: {}, endedOffW1List: 0,
  deleted: 0, noTeam: 0,
  listsChangedW1toW4: 0, schoolsAddedW1toW4: 0, listsChangedW1toSD: 0, schoolsAddedW1toSD: 0
};
const off = [], added = [];
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

for (const p of transfers) {
  const l1 = w1.topSchools(p.recruitRecord).map(t => t.teamIndex);
  const p4 = pick(i4.get(key(p)), p.prevTeam);
  const pS = pick(iS.get(key(p)), p.prevTeam);
  const pP = pick(iP.get(key(p)), p.prevTeam);
  if (!p4 && !pS) continue;
  c.tracked++;

  const l4 = p4 ? w4.topSchools(p4.recruitRecord).map(t => t.teamIndex) : [];
  const lS = pS ? sd.topSchools(pS.recruitRecord).map(t => t.teamIndex) : [];
  const new4 = l4.filter(t => !l1.includes(t)), newS = lS.filter(t => !l1.includes(t));
  if (new4.length) { c.listsChangedW1toW4++; c.schoolsAddedW1toW4 += new4.length; }
  if (newS.length) { c.listsChangedW1toSD++; c.schoolsAddedW1toSD += newS.length; if (added.length < 5) added.push(`${p.name} ${p.position} ${p.overall}: W1 [${names(w1, l1).join(", ")}] → SD adds [${names(sd, newS).join(", ")}]`); }

  if (p4?.transferCommitted) {
    c.committedByWeek4++;
    const i = l1.indexOf(p4.destination);
    if (i >= 0) { c.w4CommitOnW1List++; bump(c.w4CommitSlotOnW1, i + 1); }
  }
  if (pS?.transferCommitted) {
    c.sdCommitted++;
    const i = l1.indexOf(pS.destination);
    if (i >= 0) { c.sdCommitOnW1List++; bump(c.sdCommitSlotOnW1, i + 1); }
  }

  if (!pP) { c.deleted++; continue; }
  if (pP.team === NO_TEAM) { c.noTeam++; continue; }
  c.endedOnTeam++;
  if (pP.team === p.prevTeam) c.endedAtOldSchool++;
  const i = l1.indexOf(pP.team);
  if (i >= 0) { c.endedAtW1ListSchool++; bump(c.endedSlotOnW1, i + 1); }
  else {
    c.endedOffW1List++;
    if (off.length < 8) off.push(`${p.name} ${p.position} ${p.overall} (from ${w1.teamName(p.prevTeam)}) → ${pre.teamName(pP.team)}; W1 list [${names(w1, l1).slice(0, 5).join(", ")}…]; SD committed: ${pS?.transferCommitted ? sd.teamName(pS.destination) : "no"}`);
  }
}

console.log(JSON.stringify(c, null, 1));
console.log("\nEnded somewhere not on his Week 1 list (examples):\n  " + off.join("\n  "));
console.log("\nSchools added to lists between Week 1 and Signing Day (examples):\n  " + added.join("\n  "));
