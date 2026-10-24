import assert from "node:assert/strict";
import { forecast, slotsFor, releasableRecruit } from "../lib/market-model.mjs";
import { cleanupRecruits, recruitFutureFloors } from "../lib/recruit-cleanup.mjs";
import { planTransferMarket } from "../lib/transfer-market.mjs";

const p = (index, overall = 50, extra = {}) => ({ id: String(index).padStart(8, "0"), index, name: `Recruit ${index}`,
  position: "HB", overall, schoolYear: "Freshman", redshirt: "Eligible", dev: "Normal", kind: "recruit", stars: 2,
  teamIndex: 255, prevTeamIndex: 9, ...extra });
const school = { index: 1, name: "CPU", offScheme: "OFF_SPREAD", defScheme: "DEF_BASE4_3", prestige: 10, state: "Kansas",
  grades: {}, proPotential: {}, playingStyle: {}, boardCapacity: 35, boardUsed: 0 };
const slots = slotsFor(school).rooms;
const run = (raw, keep = new Set()) => {
  const roster = raw.map(forecast);
  return cleanupRecruits(roster, slots, recruitFutureFloors(roster, slots), keep);
};
const crowd = Array.from({ length: 8 }, (_, i) => p(i + 1, 51 + i));
const result = run(crowd);
assert.equal(result.roster.length, 5, "Keep all five modeled HB depth slots");
assert.deepEqual(result.removed.map(x => x.p.overall), [51, 52, 53], "Free multiple slots, weakest first");
assert(result.removed.every(x => x.loss1 === 0 && x.loss2 === 0));
assert.deepEqual(run([...crowd].reverse()).removed, result.removed, "Deterministic releases");
assert.equal(run(crowd.slice(0, 5)).removed.length, 0, "Useful low-rated depth is retained");
assert(!run(crowd, new Set([1])).removed.some(x => x.p.index === 1), "Keep lock protected");
for (const dev of ["College_Impact", "College_Star", "College_Elite", "Unknown"]) {
  assert.equal(run(crowd.map(x => ({ ...x, dev }))).removed.length, 0, `${dev} protected`);
  assert.equal(releasableRecruit({ ...crowd[0], dev }), false, `${dev} also protected from contingent release`);
}
assert.equal(run(crowd.map(x => ({ ...x, overall: 59 }))).removed.length, 0, "58 is an inclusive ceiling");
assert.equal(run(crowd.map(x => ({ ...x, schoolYear: "Sophomore" }))).removed.length, 0, "No JUCO sophomore cleanup");
assert.equal(run(crowd.map(x => ({ ...x, kind: "veteran", teamIndex: 1 }))).removed.length, 0, "No rostered freshman cleanup");
const graduating = Array.from({ length: 5 }, (_, i) => p(20 + i, 85, { kind: "veteran", teamIndex: 1, schoolYear: "Junior" }));
assert.equal(run([...graduating, ...crowd.slice(0, 2)]).removed.length, 0, "Retain two successors despite zero q2 value");
const futureStarters = [p(30, 58), p(31, 57), p(32, 56), p(33, 55)];
assert.equal(run([...graduating, ...futureStarters]).removed.length, 2, "Future floor permits only surplus successors");
// A buried older freshman may still provide positive second-season value.
const developing = p(40, 58, { dev: "Normal" });
const highFuture = forecast({ ...developing, overall: 58 }); highFuture.q2 = 75;
assert.equal(cleanupRecruits([...graduating.map(forecast), highFuture, forecast(p(41))], slots, { HB: 1 }, new Set()).removed.some(c => c.p.id === highFuture.id), false);

const newQB = p(100, 90, { kind: "transfer", position: "QB", schoolYear: "Junior", dev: "College_Star", homeState: "Kansas", dealbreaker: "PlayingTime" });
const input = recruits => ({ seasonYear: 2030, userTeamIndex: 0, players: [...recruits, newQB], candidates: [newQB.id], withdrawals: [], diagnostics: {},
  teams: [{ ...school, index: 0, name: "User", roster: [], nativeRoster: [] },
    { ...school, boardCapacity: recruits.length, boardUsed: recruits.length, roster: recruits.map(p => p.id), nativeRoster: recruits.map(p => p.id) }] });
const market = planTransferMarket(input(crowd), { seed: "cleanup" });
assert.equal(market.summary.surplusReleases, 3);
assert.equal(market.summary.placed, 1, "Freed board space is usable by an actual transfer");
assert.equal(market.teams[0].boardUsed, 6, "Eight commitments minus three releases plus one signing");
assert.equal(market.summary.cuts, 0, "No veteran sacrificed for surplus recruits");
assert.equal(market.teams[0].recruitReleases, 3, "Cleanup is separate from the one contingent release cap");
const userInput = input(crowd); userInput.userTeamIndex = 1;
assert.equal(planTransferMarket(userInput, { seed: "cleanup" }).cuts.length, 0, "User commitments excluded");
// An arrival makes a previously useful depth recruit surplus; clear him after the batch.
const arrival = { ...newQB, position: "HB" }, afterInput = input(crowd.slice(0, 5));
afterInput.players[afterInput.players.length - 1] = arrival; afterInput.teams[1].boardCapacity = 6;
const after = planTransferMarket(afterInput, { seed: "cleanup" });
assert.equal(after.summary.placed, 1); assert.equal(after.summary.surplusReleases, 1);
assert.equal(after.cuts[0].round, 1, "New surplus cleared after acceptance");
assert.equal(after.teams[0].final.rooms.HB.count, 5);
const unknowns = Array.from({ length: 82 }, (_, i) => p(200 + i, 80, { kind: "veteran", teamIndex: 1, position: "UNMODELED" }));
const excludedInput = input(crowd);
excludedInput.players.push(...unknowns); excludedInput.teams[1].roster.push(...unknowns.map(p => p.id));
excludedInput.teams[1].nativeRoster = [...excludedInput.teams[1].roster];
const excluded = planTransferMarket(excludedInput, { seed: "cleanup" });
assert.equal(excluded.summary.excludedSchools, 1); assert.equal(excluded.summary.surplusReleases, 3);
assert.equal(excluded.summary.cuts, 0); assert.equal(excluded.teams[0].rosterAfter, 87);
assert.equal(excluded.teams[0].excluded.excess, 2, "Unresolvable overage keeps safe cleanup and reports the actual excess");
console.log("Recruit cleanup passed: inclusive cutoff, depth, succession, development, Keep, user team, freed board capacity and post-arrival cleanup.");
