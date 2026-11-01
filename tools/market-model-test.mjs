// Small independent arithmetic vectors and constructed market states. No save writes.
import assert from "node:assert/strict";
import { forecast, slotsFor, roomValue, opportunity, utility, playerTraits, schoolTraits, pairTraits, talentPremium, replacementLimitFor, recruitReleaseLimitFor,
  drawFactory, promiseFailures, normalizedState, gradeIndex, cmp } from "../lib/market-model.mjs";
import { planTransferMarket } from "../lib/transfer-market.mjs";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const slots = slotsFor({ offScheme: "OFF_SPREAD", defScheme: "DEF_BASE4_3" }).rooms;
const incumbent = { id: "a", q1: 80, q2: null, E: 1 };
const successor = { id: "b", q1: 80, q2: 82, E: 2 };
const first = roomValue([incumbent], slots.QB), second = roomValue([incumbent, successor], slots.QB);
near(first.V1, 35); near(first.V2, 0); near(second.V1 - first.V1, 4.2); near(second.V2, 17);
near(second.V1 - first.V1 + .35 * second.V2 - 4, 6.15);
near(roomValue([incumbent, { id: "c", q1: 88, E: 1 }], slots.QB).V1 - first.V1 - 4, 8.2);
near(opportunity(incumbent, [incumbent, successor], slots.QB), 60);
near(opportunity({ ...successor, q1: 81 }, [incumbent, { ...successor, q1: 81 }], slots.QB), 500 / 7);
const support = slotsFor({ offScheme: "OFF_AIR_RAID", defScheme: "DEF_BASE4_3" }).rooms;
near(roomValue([{ id: "t", q1: 75, E: 1 }], support.TE).V1 - 4, 5);
near(opportunity({ id: "t", q1: 75, E: 1 }, [{ id: "t", q1: 75, E: 1 }], support.TE), 55);
near(roomValue([{ id: "f", q1: 75, E: 1 }], support.FB).V1 - 4, -.4);
assert.deepEqual(slots.HB.h, [1, .50, .30, .12, .03]); assert.deepEqual(slots.HB.opportunity, [100, 70, 55, 20]);
assert.deepEqual(slots.WR.h, [1, 1, 1, .30, .30, .12, .12, .12, .03, .03, .03]);
assert.equal(support.TE.S, 0); assert.equal(support.TE.support, 2); assert.equal(support.FB.support, 1);
assert.equal(normalizedState(" New-York. "), "newyork"); assert.equal(normalizedState("TX"), null);
assert.equal(normalizedState("International"), null); near(gradeIndex("Bminus"), 100 * 7 / 12); near(gradeIndex("COUNT"), 50);

const base = { id: "x", index: 1, name: "Test", position: "QB", overall: 78, schoolYear: "Junior", redshirt: "Previous", dev: "College_Elite", kind: "transfer", prevTeamIndex: 9, homeState: "Kansas", dealbreaker: "PlayingTime" };
assert.equal(forecast(base).E, 1); assert.equal(forecast(base).q1, 80); assert.equal(forecast(base).q2, null);
assert.equal(forecast({ ...base, kind: "recruit" }).E, 2); assert.equal(forecast({ ...base, kind: "recruit" }).q1, 78);
assert.equal(forecast({ ...base, redshirt: "Current" }).E, 2); assert.equal(forecast({ ...base, redshirt: "Current" }).q2, 85);
assert.equal(forecast({ ...base, schoolYear: "Senior" }).E, 0);

const draw = drawFactory("model-unit", 2030), p = forecast(base);
const team = { index: 1, prestige: 9, state: "Kansas", grades: {}, proPotential: {}, playingStyle: {} };
const pt = playerTraits(p, draw), st = schoolTraits(team, draw), pair = pairTraits(p, team, pt, st, draw);
const value = utility(p, [p], slots.QB, pt, pair);
near(Object.values(pt.weights).reduce((a, b) => a + b, 0), 1);
near(value.U, (1 - pt.a - pt.b) * value.football + pt.a * pair.L + pt.b * pair.C + pair.taste - pair.returnFriction);
near(st.delta, .25 + .20 * st.d); near(st.cutSurcharge, 2 + 2 * st.d);
assert.deepEqual(playerTraits(p, draw), playerTraits({ ...p, overall: 99 }, draw));
assert.equal(cmp(0.00000049, 0), 0); assert.ok(cmp(0.00000051, 0) > 0);
const promise = { O1: 60, F: 65, U: 70, outside: 50, E: 2, contract: "immediate opportunity" };
assert.deepEqual(promiseFailures(promise, { O1: 48, F: 53, U: 50.1 }), []);
assert.deepEqual(promiseFailures(promise, { O1: 47.9, F: 52.9, U: 50 }), ["immediate opportunity", "future scenario", "outside option"]);
assert.deepEqual(promiseFailures({ ...promise, contract: "developmental reserve" }, { O1: 0, F: 53, U: 50.1 }), []);

const player = (index, position, overall = 80, kind = "transfer") => ({ ...base, id: index.toString(2).padStart(32, "0"), index, name: `Player ${index}`,
  position, overall, kind, teamIndex: kind === "veteran" ? 1 : 255, prevTeamIndex: 9 });
const school = (index, roster = [], extra = {}) => ({ index, name: `School ${index}`, offScheme: "OFF_SPREAD", defScheme: "DEF_BASE4_3",
  prestige: 10, state: "Kansas", grades: {}, proPotential: {}, playingStyle: {}, boardCapacity: 35, boardUsed: 0,
  roster: roster.map(p => p.id), nativeRoster: roster.map(p => p.id), ...extra });
const inputFor = (cpu, players, candidates) => ({ seasonYear: 2030, userTeamIndex: 0, teams: [school(0), ...cpu], players,
  candidates: candidates.map(p => p.id), withdrawals: [], diagnostics: {} });

const qb1 = player(1, "QB", 90), qb2 = player(2, "QB", 86), wr = player(3, "WR", 88);
const competitive = inputFor([school(1), school(2), school(3)], [qb1, qb2, wr], [qb1, qb2, wr]);
const plan = planTransferMarket(competitive, { seed: "test-concurrent" });
assert.equal(plan.summary.placed, 3); assert.ok(plan.rounds[0].schoolsWithMultipleOffers > 0);
assert.ok(plan.rounds[0].offers.filter(o => o.index === qb1.index).length > 1);
assert.ok(plan.rounds.length >= 2); assert.equal(plan.diagnostics.residualFeasiblePairs, 0);
for (const r of plan.rounds) for (const t of competitive.teams.slice(1)) {
  const offers = r.offers.filter(o => o.teamIndex === t.index);
  assert.equal(new Set(offers.map(o => o.position)).size, offers.length);
  offers.forEach((o, k) => { assert.equal(o.k, k); near(o.cost, 4 + .5 * (o.n + k)); });
}
const reordered = planTransferMarket({ ...competitive, players: [...competitive.players].reverse(), teams: [...competitive.teams].reverse(), candidates: [...competitive.candidates].reverse() }, { seed: "test-concurrent" });
assert.deepEqual(reordered, plan);
const veto = planTransferMarket(competitive, { seed: "test-concurrent", notAt: new Map([[qb1.index, new Set([1, 2, 3])]]) });
assert.ok(veto.unplaced.some(p => p.index === qb1.index));
assert.equal(veto.summary.placed, 2);

const unknowns = Array.from({ length: 84 }, (_, i) => player(100 + i, "UNMODELED", 40, "veteran"));
const oldQB = player(190, "QB", 50, "veteran"), newQB = player(191, "QB", 90);
const full = inputFor([school(1, [...unknowns, oldQB])], [...unknowns, oldQB, newQB], [newQB]);
const replacement = planTransferMarket(full, { seed: "full" });
assert.equal(replacement.summary.replacementCuts, 1); assert.equal(replacement.cuts[0].index, oldQB.index);
assert.equal(replacement.teams[0].rosterAfter, 85); assert.equal(replacement.teams[0].coverage.QB, 1);
const kept = planTransferMarket(full, { seed: "full", keep: new Set([oldQB.index]) });
assert.equal(kept.summary.placed, 0); assert.equal(kept.summary.cuts, 0);
const noBoard = planTransferMarket({ ...full, teams: full.teams.map(t => t.index ? { ...t, boardCapacity: 1, boardUsed: 1 } : t) }, { seed: "full" });
assert.equal(noBoard.summary.placed, 0); assert.equal(noBoard.unplaced[0].boardOnlyVetoes.length, 1);

const protectedRecruits = Array.from({ length: 86 }, (_, i) => player(300 + i, "WR", 50, "recruit"));
const overage = planTransferMarket(inputFor([school(1, protectedRecruits, { boardCapacity: 100, boardUsed: 86 })], [...protectedRecruits, newQB], [newQB]), { seed: "protected" });
assert.equal(overage.summary.excludedSchools, 1); assert.equal(overage.summary.cuts, 0); assert.equal(overage.teams[0].rosterAfter, 86);

const sevenOld = ["QB", "HB", "WR", "TE", "OT", "OG", "C"].map((r, i) => player(500 + i, r, 50, "veteran"));
const sevenNew = sevenOld.map((p, i) => player(600 + i, p.position, 90));
const sevenCuts = prestige => planTransferMarket(inputFor([school(1, [...unknowns.slice(0, 78), ...sevenOld], { prestige })], [...unknowns.slice(0, 78), ...sevenOld, ...sevenNew], sevenNew), { seed: "six-cuts" });
const limited = sevenCuts(0);
assert.equal(limited.summary.replacementCuts, 6); assert.equal(limited.summary.placed, 6); assert.equal(limited.summary.unplaced, 1);
assert.equal(limited.unplaced[0].vetoCounts["replacement allowance"], 1);
// A full school offers once per room in the same round, up to its remaining replacements.
assert.equal(limited.summary.rounds, 1); assert.equal(limited.rounds[0].offers.length, 6);
limited.rounds[0].offers.forEach((o, k) => { assert.equal(o.k, k); assert.equal(o.cut.position, o.position); });
assert.equal(sevenCuts(10).summary.replacementCuts, 7, "A top program has more release room");

// Another room can't take a center room below three or a tight end room below five; a swap at his own position can.
for (const [position, floor] of [["C", 3], ["TE", 5]]) {
  const hands = Array.from({ length: floor + 1 }, (_, i) => player(720 + i, position, 50, "veteran")), wide = player(730, "WR", 90), upgrade = player(731, position, 90);
  const market = (room, signer) => { const others = unknowns.slice(0, 85 - room.length); return planTransferMarket(inputFor([school(1, [...others, ...room])], [...others, ...room, signer], [signer]), { seed: "room-floor" }); };
  assert.equal(market(hands.slice(0, floor), wide).summary.placed, 0, `${position} at its floor is safe`);
  assert.equal(market(hands, wide).summary.placed, 1, `${position} above its floor can give up one`);
  assert.equal(market(hands.slice(0, floor), upgrade).cuts[0].position, position, `${position} swap`);
}

// A veteran rated 78+ can be released only for a player at his own position.
const qbRoom = third => [player(710, "HB", 90, "veteran"), player(711, "HB", 85, "veteran"), player(712, "HB", third, "veteran")];
const guardMarket = third => planTransferMarket(inputFor([school(1, [...unknowns.slice(0, 82), ...qbRoom(third)])],
  [...unknowns.slice(0, 82), ...qbRoom(third), player(713, "WR", 90)], [player(713, "WR", 90)]), { seed: "guard" });
assert.equal(guardMarket(78).summary.placed, 0); assert.equal(guardMarket(77).summary.replacementCuts, 1);
assert.equal(guardMarket(77).cuts[0].index, 712);

// Both newcomers' cheapest release is an HB. One school's offers may not share a
// room, so the second waits a round and releases a different HB.
const fourHB = [0, 1, 2, 3].map(i => player(700 + i, "HB", 50, "veteran"));
const newWR = player(192, "WR", 90);
const shared = planTransferMarket(inputFor([school(1, [...unknowns.slice(0, 81), ...fourHB])], [...unknowns.slice(0, 81), ...fourHB, newQB, newWR], [newQB, newWR]), { seed: "shared-room" });
assert.equal(shared.rounds[0].offers.length, 1); assert.equal(shared.summary.rounds, 2); assert.equal(shared.summary.placed, 2);
assert.ok(shared.cuts.every(c => c.position === "HB")); assert.equal(new Set(shared.cuts.map(c => c.id)).size, 2);

// School 1 spends its one WR offer on wr1; wr2 holds School 2's offer. If School 1 has
// room next round he trades up; if not, he stays and no later school can take him.
const wr1 = player(800, "WR", 92), wr2 = player(801, "WR", 88);
const holdMarket = (rosterSize, extra = {}) => planTransferMarket(inputFor([school(1, unknowns.slice(0, rosterSize), extra), school(2, [], { prestige: 3, state: "Ohio" })],
  [...unknowns, wr1, wr2], [wr1, wr2]), { seed: "real-miss", notAt: new Map([[wr1.index, new Set([2])]]) });
const tradedUp = holdMarket(83), signedUp = tradedUp.placements.find(p => p.index === wr2.index);
assert.equal(signedUp.teamIndex, 1); assert.equal(signedUp.round, 2); assert.equal(tradedUp.summary.tradeUps, 1);
assert.deepEqual(signedUp.holds.map(h => h.teamIndex), [2, 1]); assert.equal(signedUp.actualOffers.length, 2);
assert.equal(tradedUp.teams.find(t => t.teamIndex === 2).acquired, 0);
const stayed = holdMarket(84), signedThere = stayed.placements.find(p => p.index === wr2.index);
assert.equal(signedThere.teamIndex, 2); assert.equal(stayed.summary.tradeUps, 0); assert.equal(signedThere.betterSchool, null);
// The better school wanted him but its board filled: reported, and not a real miss.
const boardFull = holdMarket(83, { boardCapacity: 1 }), blocked = boardFull.placements.find(p => p.index === wr2.index);
assert.equal(blocked.teamIndex, 2); assert.equal(blocked.betterSchool.teamIndex, 1); assert.equal(blocked.betterSchool.openAtEnd, false); assert.ok(blocked.missedPreferenceGap > 10);
assert.equal(boardFull.diagnostics.missedPreference.count, 0); assert.equal(boardFull.diagnostics.missedPreference.willingBetterSchool, 1);

// wrB holds School 1 with a release, then trades up: the released veteran stays.
const oldWR = player(820, "WR", 50, "veteran"), wrTop = player(821, "WR", 92), wrNext = player(822, "WR", 88), oldQB2 = player(823, "QB", 80, "veteran"), qbNew = player(824, "QB", 90);
const weak = { prestige: 3, state: "Ohio" };
const departed = planTransferMarket(inputFor([school(1, [...unknowns.slice(0, 84), oldWR], weak), school(2)], [...unknowns, oldWR, wrTop, wrNext], [wrTop, wrNext]),
  { seed: "departure", notAt: new Map([[wrTop.index, new Set([1])]]) });
assert.equal(departed.summary.tradeUps, 1); assert.equal(departed.summary.replacementCuts, 0); assert.equal(departed.summary.placed, 2);
assert.ok(departed.teams.find(t => t.teamIndex === 1).roster.includes(oldWR.id));
// wrNext's roster spot reopens when he leaves, so qbNew no longer needs his release.
const returned = planTransferMarket(inputFor([school(1, [...unknowns.slice(0, 83), oldQB2], weak), school(2)], [...unknowns, oldQB2, wrTop, wrNext, qbNew], [wrTop, wrNext, qbNew]),
  { seed: "returned", notAt: new Map([[wrTop.index, new Set([1])], [qbNew.index, new Set([2])]]) });
assert.equal(returned.summary.restoredReleases, 1); assert.equal(returned.summary.replacementCuts, 0);
assert.equal(returned.placements.find(p => p.index === qbNew.index).teamIndex, 1); assert.equal(returned.teams.find(t => t.teamIndex === 1).rosterAfter, 85);

// A full-board school may release up to three 1–2★ recruits, more at a bigger program, never Star/Elite development,
// to sign transfers; the board stays full.
const recruit = (index, stars, dev = "Normal", overall = 50) => ({ ...player(index, "WR", overall, "recruit"), stars, dev });
const lowRecruit = recruit(900, 2), highRecruit = recruit(901, 4, "Normal", 70), wrA = player(902, "WR", 90), wrB = player(903, "WR", 88);
const boardMarket = releasable => planTransferMarket(inputFor([school(1, [releasable, highRecruit], { boardCapacity: 2, boardUsed: 2 })],
  [releasable, highRecruit, wrA, wrB], [wrA, wrB]), { seed: "recruit-release" });
const freed = boardMarket(lowRecruit);
assert.equal(freed.summary.placed, 1); assert.equal(freed.summary.recruitReleases, 1); assert.equal(freed.summary.cuts, 0);
assert.equal(freed.cuts[0].kind, "recruit"); assert.equal(freed.cuts[0].index, lowRecruit.index);
assert.equal(freed.teams[0].boardUsed, 2); assert.equal(freed.teams[0].recruitReleases, 1);
assert.equal(freed.unplaced[0].vetoCounts["commitment board full"], 1);
const starDev = boardMarket(recruit(900, 2, "College_Star"));
assert.equal(starDev.summary.placed, 0); assert.equal(starDev.summary.recruitReleases, 0);

const fourRecruits = [0, 1, 2, 3].map(i => recruit(910 + i, 2)), fourWR = [90, 89, 88, 87].map((o, i) => player(920 + i, "WR", o));
const recruitReleases = prestige => planTransferMarket(inputFor([school(1, fourRecruits, { prestige, boardCapacity: 4, boardUsed: 4 })], [...fourRecruits, ...fourWR], fourWR), { seed: "three-releases" });
const threeReleases = recruitReleases(0);
assert.equal(threeReleases.summary.recruitReleases, 3); assert.equal(threeReleases.summary.placed, 3); assert.equal(threeReleases.teams[0].boardUsed, 4);
assert.equal(threeReleases.unplaced[0].vetoCounts["commitment board full"], 1);
assert.equal(recruitReleases(10).unplaced[0].vetoCounts["commitment board full"], undefined, "A top program still has release room");

const zeroBoard = planTransferMarket(inputFor([school(1, [], { boardCapacity: 0 })], [newQB], [newQB]), { seed: "zero" });
assert.equal(zeroBoard.summary.placed, 0); assert.equal(zeroBoard.summary.rounds, 0);
assert.equal(zeroBoard.diagnostics.missedPreference.share, null);
assert.throws(() => planTransferMarket({ ...competitive, userTeamIndex: null }), /valid user team/);
assert.throws(() => planTransferMarket({ ...competitive, seasonYear: null }), /seasonYear/);

// The rare lifestyle trait is gone: everyone keeps the ordinary social weight.
for (const i of Array.from({ length: 400 }, (_, n) => n)) assert.ok(playerTraits({ ...p, id: `t${i}` }, draw).a <= .10);

// QB floor: releases cannot take a room below three, and a short school signs a QB as depth.
const threeQBs = Array.from({ length: 3 }, (_, i) => player(1000 + i, "QB", 70, "veteran"));
const qbGuard = planTransferMarket(inputFor([school(1, [...unknowns.slice(0, 82), ...threeQBs])], [...unknowns.slice(0, 82), ...threeQBs, player(1010, "WR", 90)], [player(1010, "WR", 90)]), { seed: "qb-guard" });
assert.ok(!qbGuard.cuts.some(c => c.position === "QB"), "A third QB is not released for another room");
const threeStars = Array.from({ length: 3 }, (_, i) => player(1020 + i, "QB", 88, "veteran")), depthQB = player(1030, "QB", 66);
const twoStars = threeStars.slice(0, 2);
const depthFill = planTransferMarket(inputFor([school(1, twoStars)], [...twoStars, depthQB], [depthQB]), { seed: "qb-fill" });
assert.equal(depthFill.summary.placed, 1); assert.equal(depthFill.placements[0].contract, "depth floor");
assert.deepEqual(depthFill.diagnostics.qbFloor.short, []);
const noFill = planTransferMarket(inputFor([school(1, threeStars)], [...threeStars, depthQB], [depthQB]), { seed: "qb-full" });
assert.equal(noFill.summary.placed, 0, "No depth signing once the room has three");
// The league is one QB short, so the lowest-rated QB waits for the short school; once the market settles he is free.
const reserved = planTransferMarket(inputFor([school(1, threeStars), school(2, twoStars, { boardCapacity: 0 })], [...threeStars, depthQB], [depthQB]), { seed: "qb-reserve" });
assert.equal(reserved.summary.placed, 0); assert.equal(reserved.unplaced[0].vetoCounts["QB reserved"], undefined); assert.deepEqual(reserved.diagnostics.qbFloor.reserved, [depthQB.index]);
// A lifted reservee who would start signs, and a new starting QB skips the per-signing cost.
const weakQBs = Array.from({ length: 3 }, (_, i) => player(1060 + i, "QB", 70, "veteran")), lateQB = player(1063, "QB", 80), earlyWR = player(1064, "WR", 90);
const lifted = planTransferMarket(inputFor([school(1, weakQBs), school(2, twoStars, { boardCapacity: 0 })], [...weakQBs, ...twoStars, lateQB, earlyWR], [lateQB, earlyWR]), { seed: "qb-lift" });
const liftedQB = lifted.placements.find(p => p.index === lateQB.index);
assert.ok(liftedQB, "A reserved QB signs once the reserve lifts"); assert.ok(liftedQB.n >= 1); near(liftedQB.cost, 4);

// A bigger program pays for talent past its immediate need; small schools barely do.
near(talentPremium({ prestige: 10 }, { overall: 85 }), 20); near(talentPremium({ prestige: 1 }, { overall: 85 }), 2); near(talentPremium({ prestige: 10 }, { overall: 70 }), 0);
assert.equal(replacementLimitFor({ prestige: 10 }), 12); assert.equal(replacementLimitFor({ prestige: 0 }), 6);
assert.equal(recruitReleaseLimitFor({ prestige: 10 }), 8); assert.equal(recruitReleaseLimitFor({ prestige: 0 }), 3);
assert.deepEqual(promiseFailures({ ...promise, contract: "depth floor" }, { O1: 0, F: 0, U: 0 }), []);

// Room caps: a capped room signs only by releasing someone from it.
const eightHB = Array.from({ length: 8 }, (_, i) => player(1040 + i, "HB", 60, "veteran")), capHB = player(1050, "HB", 92);
const capped = planTransferMarket(inputFor([school(1, eightHB)], [...eightHB, capHB], [capHB]), { seed: "cap" });
assert.equal(capped.summary.placed, 0, "Below 85 with a full room there is nothing to swap");
const fullCapped = planTransferMarket(inputFor([school(1, [...unknowns.slice(0, 77), ...eightHB])], [...unknowns.slice(0, 77), ...eightHB, capHB], [capHB]), { seed: "cap-swap" });
assert.equal(fullCapped.summary.placed, 1); assert.equal(fullCapped.cuts[0].position, "HB");

console.log("Market model checks passed: arithmetic, ties, forecasts, support rooms, traits, original promises, simultaneous offers, deterministic order, locks, full-roster replacement, per-room offers at 85, held offers and trade-ups, returned releases, the 78+ release guard, recruit releases, protected overage, board-only veto, prestige release limits, talent premium and the QB reserve.");
