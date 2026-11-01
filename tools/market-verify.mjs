// Independent transcript and termination verifier. Reads the original save only;
// never calls the planner, its evaluator, or save/edit code. Formula functions are
// intentionally shared; tools/market-model-test.mjs tests their arithmetic.
// node tools/market-verify.mjs --plan <plan.json> --source <original save/backup>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Dynasty } from "../lib/dynasty.mjs";
import { buildMarketInput } from "../lib/market-input.mjs";
import { ROOMS, forecast, slotsFor, drawFactory, schoolTraits, playerTraits,
  pairTraits, roomValue, utility, promiseFailures, cmp, byId, releasableRecruit, coverageFloor, talentPremium, replacementLimitFor, recruitReleaseLimitFor, PARAMETERS } from "../lib/market-model.mjs";

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const digest = value => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const hashFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sameIds = (a, b, message) => assert.deepEqual([...a].sort(), [...b].sort(), message);
const number = (actual, expected, message) => {
  assert.equal(typeof actual, "number", message);
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
};
const chosenByPlayer = (a, b) => cmp(b.value.U, a.value.U) || cmp(b.value.O1, a.value.O1) || a.teamIndex - b.teamIndex;
const chosenVariant = (a, b) => cmp(b.net, a.net) || Number(!!a.cut) - Number(!!b.cut) || (a.cut && b.cut ? byId(a.cut, b.cut) : 0);
const chosenBySchool = (a, b) => cmp(b.priority, a.priority) || cmp(b.net, a.net) || byId(a.p, b.p);

export function verifyMarket(input, plan, { onProgress = () => {} } = {}) {
  assert.equal(plan.userTeamIndex, input.userTeamIndex, "User-team identity");
  assert.equal(plan.seasonYear, input.seasonYear, "Season identity");
  if (plan.binding?.inputHash) assert.equal(digest(input), plan.binding.inputHash, "Original normalized input hash");
  const draw = drawFactory(plan.seed, input.seasonYear);
  const players = new Map(input.players.map(p => [p.id, forecast(p)]));
  const remaining = new Map(input.candidates.map(id => [id, players.get(id)]));
  const candidateIds = new Set(input.candidates);
  const pt = new Map([...remaining.values()].map(p => [p.id, playerTraits(p, draw)]));
  const locks = plan.binding?.locks ?? { keep: [], notAt: [] };
  const keep = new Set(locks.keep), notAt = new Map(locks.notAt.map(([id, teams]) => [id, new Set(teams)]));
  const stats = { baselineCuts: 0, surplusReleases: 0, offers: 0, accepted: 0, rounds: 0, verifiedOfferCutVariants: 0,
    finalPairs: 0, finalStructurallyEligiblePairs: 0, finalTransactions: 0, finalCutVariants: 0,
    finalFeasiblePairs: 0, finalFeasibleTransactions: 0, promiseChecks: 0, boardOnlyPairs: 0 };
  const residual = [], placementById = new Map(plan.placements.map(p => [p.id, p]));
  assert.equal(placementById.size, plan.placements.length, "No repeated signer");
  assert.equal(new Set(plan.unplaced.map(p => p.id)).size, plan.unplaced.length, "No repeated unplaced candidate");
  sameIds([...plan.placements, ...plan.unplaced].map(p => p.id), input.candidates, "Complete candidate partition");
  assert.deepEqual(plan.withdrawals, input.withdrawals, "Complete original CPU withdrawal list");
  const blockPairs = plan.diagnostics.promiseBlocks.map(b => `${b.id}|${b.teamIndex}`);
  assert.equal(new Set(blockPairs).size, blockPairs.length, "Each blocked pair is logged once");

  // No feasibility cache: this derives only roster rooms, additive values and
  // each individual veteran's removal loss for the independently replayed state.
  const refresh = s => {
    s.rooms = Object.fromEntries(ROOMS.map(room => [room, s.roster.filter(p => p.room === room)]));
    s.values = Object.fromEntries(ROOMS.map(room => [room, roomValue(s.rooms[room], s.slots[room])]));
    const removal = p => {
      const after = roomValue(s.rooms[p.room].filter(x => x.id !== p.id), s.slots[p.room]);
      const loss1 = s.values[p.room].V1 - after.V1, loss2 = s.values[p.room].V2 - after.V2;
      return { p, loss1, loss2, loss: loss1 + s.traits.delta * loss2 };
    };
    s.veterans = s.roster.filter(p => p.kind === "veteran" && p.room && !keep.has(p.index)).map(removal);
    s.recruits = s.roster.filter(p => releasableRecruit(p) && p.room && !keep.has(p.index)).map(removal);
  };
  const freeBoard = s => s.team.boardCapacity - s.team.boardUsed + s.recruitReleases - s.n;
  const contingentReleases = s => s.recruitReleases - s.surplusReleases;
  const recruitMode = s => freeBoard(s) <= 0 && contingentReleases(s) < recruitReleaseLimitFor(s.team) && s.recruits.length > 0;
  const surplusDepth = (s, room) => Math.max(s.slots[room].h.length, PARAMETERS.roomFloors[room] ?? 0);
  // Reconstruct surplus decisions without importing the planner's cleanup helper.
  const cleanup = (s, round) => {
    const expected = [];
    for (const room of ROOMS) {
      while (s.rooms[room].length > surplusDepth(s, room)) {
        const before = s.values[room];
        const eligible = s.roster.filter(p => p.room === room && p.kind === "recruit" && p.teamIndex === 255
          && p.schoolYear === "Freshman" && p.overall <= PARAMETERS.surplusFreshmanMaxOverall && ["Normal", "College_Normal"].includes(p.dev) && !keep.has(p.index))
          .sort((a, b) => a.overall - b.overall || (a.q2 ?? 0) - (b.q2 ?? 0) || byId(a, b));
        const p = eligible.find(p => {
          const after = s.rooms[room].filter(x => x.id !== p.id), value = roomValue(after, s.slots[room]);
          if (room === "QB" && after.filter(x => x.kind !== "transfer").length < PARAMETERS.qbMinimum) return false;
          return after.filter(x => x.E >= 2).length >= s.futureCoverage[room] && !cmp(before.V1, value.V1) && !cmp(before.V2, value.V2);
        });
        if (!p) break;
        expected.push({ p, roomCountBefore: s.rooms[room].length, futureCountAfter: s.rooms[room].filter(x => x.id !== p.id && x.E >= 2).length });
        s.roster = s.roster.filter(x => x.id !== p.id); s.recruitReleases++; s.surplusReleases++; refresh(s);
      }
    }
    const recorded = plan.cuts.filter(c => c.teamIndex === s.team.index && c.reason === "surplus" && c.round === round);
    assert.deepEqual(recorded.map(c => c.id), expected.map(c => c.p.id), `${s.team.name}: round ${round} surplus releases`);
    expected.forEach((e, i) => {
      const c = recorded[i]; assert.equal(c.kind, "recruit"); assert.equal(c.index, e.p.index);
      number(c.loss1, 0, "Surplus current value loss"); number(c.loss2, 0, "Surplus future value loss"); number(c.marginalLoss, 0, "Surplus total loss");
      assert.equal(c.coverageFloor, surplusDepth(s, e.p.room)); assert.equal(c.roomCountBefore, e.roomCountBefore);
      assert.equal(c.futureFloor, s.futureCoverage[e.p.room]); assert.equal(c.futureCountAfter, e.futureCountAfter);
    });
    stats.surplusReleases += expected.length;
  };
  const states = input.teams.filter(t => t.index !== input.userTeamIndex).map(team => {
    const s = { team, slots: slotsFor(team).rooms, traits: schoolTraits(team, draw),
      roster: team.roster.map(id => players.get(id)), n: 0, replacements: 0, recruitReleases: 0, surplusReleases: 0,
      promises: new Map(), pairs: new Map(), coverage: {}, futureCoverage: {}, excluded: false };
    assert.ok(s.roster.every(Boolean), `${team.name}: known roster identities`);
    assert.ok(s.roster.every(p => !remaining.has(p.id)), `${team.name}: CPU withdrawals normalized`);
    refresh(s);
    for (const room of ROOMS) s.coverage[room] = Math.min(s.rooms[room].length, coverageFloor(room, s.slots[room]));
    for (const room of ROOMS) s.futureCoverage[room] = Math.min(s.rooms[room].filter(p => p.E >= 2).length,
      s.slots[room].S ? s.slots[room].S + 1 : s.slots[room].support);
    cleanup(s, 0);
    const original = [...s.roster], expectedCuts = [];
    while (s.roster.length > 85) {
      const cuts = s.veterans.filter(c => s.rooms[c.p.room].length - 1 >= s.coverage[c.p.room])
        .sort((a, b) => cmp(a.loss, b.loss) || byId(a.p, b.p));
      if (!cuts.length) { s.roster = original; s.excluded = true; expectedCuts.length = 0; refresh(s); break; }
      expectedCuts.push(cuts[0]);
      s.roster = s.roster.filter(p => p.id !== cuts[0].p.id); refresh(s);
    }
    const recorded = plan.cuts.filter(c => c.teamIndex === team.index && c.kind === "baseline");
    assert.deepEqual(recorded.map(c => c.id), expectedCuts.map(c => c.p.id), `${team.name}: baseline trim order`);
    expectedCuts.forEach((c, i) => number(recorded[i].marginalLoss, c.loss, `${team.name}: baseline loss`));
    stats.baselineCuts += expectedCuts.length;
    return s;
  });
  const byTeam = new Map(states.map(s => [s.team.index, s]));
  // The lowest-rated QBs the league is short of sign only below the minimum until the market first settles.
  let reserveLifted = false;
  const qbNeed = states.reduce((n, s) => n + (s.excluded ? 0 : Math.max(0, PARAMETERS.qbMinimum - s.rooms.QB.length)), 0);
  const reservedQBs = new Set([...remaining.values()].filter(p => p.room === "QB").sort((a, b) => a.overall - b.overall || byId(a, b)).slice(0, qbNeed).map(p => p.id));
  sameIds(plan.diagnostics.qbFloor.reserved, [...reservedQBs].map(id => players.get(id).index), "Reserved QBs");
  const pair = (p, s) => {
    // Only fixed hash-derived traits are cached, never pair feasibility.
    if (!s.pairs.has(p.id)) s.pairs.set(p.id, pairTraits(p, s.team, pt.get(p.id), s.traits, draw));
    return s.pairs.get(p.id);
  };
  const violations = (s, roster) => {
    const result = [];
    for (const [id, promise] of s.promises) {
      const p = players.get(id), room = roster.filter(x => x.room === p.room);
      const value = utility(p, room, s.slots[p.room], pt.get(id), pair(p, s));
      stats.promiseChecks++;
      if (promiseFailures(promise, value).length) result.push(id);
    }
    return result;
  };

  // Enumerate EVERY permitted cut, including all cross-room veterans. Sharing
  // the identical incoming-room arithmetic across cross-room cuts does not prune
  // transactions; every variant gets its own gain, coverage and willingness test.
  // A full board permits only recruit-release variants (one release per school).
  const enumerate = (s, p, { ignoreBoard = false } = {}) => {
    const releasing = !ignoreBoard && recruitMode(s);
    if (s.excluded || notAt.get(p.index)?.has(s.team.index) || s.roster.length > 85 ||
      (!ignoreBoard && freeBoard(s) <= 0 && !releasing) ||
      (!reserveLifted && reservedQBs.has(p.id) && s.rooms.QB.length >= PARAMETERS.qbMinimum) ||
      (!releasing && s.roster.length === 85 && s.replacements >= replacementLimitFor(s.team))) return { structural: false, variants: [] };
    const adding = [...s.rooms[p.room], p], valueAdded = roomValue(adding, s.slots[p.room]);
    const opportunityAdded = utility(p, adding, s.slots[p.room], pt.get(p.id), pair(p, s));
    const incomingPromises = [...s.promises.entries()].filter(([id]) => players.get(id).room === p.room);
    const promiseOkay = room => incomingPromises.every(([id, promise]) => {
      const prior = players.get(id); stats.promiseChecks++;
      return !promiseFailures(promise, utility(prior, room, s.slots[p.room], pt.get(id), pair(prior, s))).length;
    });
    const additionPromises = promiseOkay(adding), variants = [];
    for (const cut of releasing ? s.recruits : s.roster.length < 85 ? [null] : s.veterans) {
      // Held transfers can still leave, so only players who are staying count toward the floor.
      if (cut && cut.p.room !== p.room && s.rooms[cut.p.room].filter(x => !candidateIds.has(x.id)).length - 1 < s.coverage[cut.p.room]) continue;
      if (cut && cut.p.room !== p.room && cut.p.kind === "veteran" && cut.p.overall >= PARAMETERS.crossRoomProtectedOverall) continue;
      const sameRoom = cut?.p.room === p.room;
      if (!sameRoom && s.rooms[p.room].length >= (PARAMETERS.roomCaps[p.room] ?? Infinity)) continue;
      const room = sameRoom ? adding.filter(x => x.id !== cut.p.id) : adding;
      if (room.length < s.coverage[p.room]) continue;
      const roomAfter = sameRoom ? roomValue(room, s.slots[p.room]) : valueAdded;
      const gain1 = roomAfter.V1 - s.values[p.room].V1 - (cut && !sameRoom ? cut.loss1 : 0);
      const gain2 = roomAfter.V2 - s.values[p.room].V2 - (cut && !sameRoom ? cut.loss2 : 0);
      const newStarter = p.room === "QB" && s.rooms.QB.every(x => x.overall < p.overall);
      const gain = gain1 + s.traits.delta * gain2, cost = 4 + (newStarter ? 0 : .5 * s.n) + (cut ? s.traits.cutSurcharge : 0);
      const value = sameRoom ? utility(p, room, s.slots[p.room], pt.get(p.id), pair(p, s)) : opportunityAdded;
      const promisesOkay = sameRoom ? promiseOkay(room) : additionPromises;
      const depthFloor = p.room === "QB" && s.rooms.QB.length < PARAMETERS.qbMinimum && !sameRoom;
      const net = gain - cost + talentPremium(s.team, p) + (depthFloor ? PARAMETERS.depthFloorBonus : 0);
      variants.push({ p, teamIndex: s.team.index, cut: cut?.p ?? null, cutLoss: cut?.loss ?? 0, cutRoomCount: cut ? s.rooms[cut.p.room].length : null,
        gain1, gain2, gain, cost, net, value, depthFloor,
        feasible: cmp(net, 0) > 0 && (depthFloor || cmp(value.U, pt.get(p.id).outside) > 0) && promisesOkay });
    }
    return { structural: true, variants };
  };
  const held = new Map(), tried = new Set(), offersByPlayer = new Map();
  let holdSequence = 0, tradeUps = 0, restoredReleases = 0;
  const currentU = (p, s) => utility(p, s.rooms[p.room], s.slots[p.room], pt.get(p.id), pair(p, s)).U;
  // Surplus decisions for a roster, written without the planner's cleanup helper.
  const surplusOf = (s, start, boardWith) => {
    let roster = [...start];
    const removed = [];
    for (const room of ROOMS) {
      for (;;) {
        const members = roster.filter(p => p.room === room);
        if (members.length <= surplusDepth(s, room)) break;
        const before = roomValue(members, s.slots[room]);
        const p = members.filter(x => x.kind === "recruit" && x.teamIndex === 255 && x.schoolYear === "Freshman" && x.overall <= PARAMETERS.surplusFreshmanMaxOverall && ["Normal", "College_Normal"].includes(x.dev) && !keep.has(x.index))
          .sort((a, b) => a.overall - b.overall || (a.q2 ?? 0) - (b.q2 ?? 0) || byId(a, b)).find(x => {
            const after = members.filter(y => y.id !== x.id), value = roomValue(after, s.slots[room]);
            if (room === "QB" && after.filter(y => y.kind !== "transfer").length < PARAMETERS.qbMinimum) return false;
            return after.filter(y => y.E >= 2).length >= s.futureCoverage[room] && !cmp(before.V1, value.V1) && !cmp(before.V2, value.V2);
          });
        if (!p) break;
        removed.push(p.id); roster = roster.filter(x => x.id !== p.id);
      }
    }
    // An earlier surplus release stays out if bringing him back would overflow.
    for (const id of s.heldSurplus) {
      if (roster.length <= 85 && boardWith(removed.length) >= 0) break;
      if (!roster.some(x => x.id === id)) continue;
      roster = roster.filter(x => x.id !== id); removed.push(id);
    }
    return { roster, removed };
  };
  // Independently replays a school from its holds, newest hold first for returned releases.
  const rebuild = s => {
    const offers = [...held.values()].filter(h => h.offer.teamIndex === s.team.index).sort((a, b) => a.sequence - b.sequence);
    const out = new Set(offers.filter(h => h.cut).map(h => h.cut.id));
    const rosterNow = () => s.base.filter(p => !out.has(p.id)).concat(offers.map(h => h.offer.p));
    const boardWith = surplus => s.team.boardCapacity - s.team.boardUsed + s.baseSurplus + surplus + offers.filter(x => x.cut?.kind === "recruit").length - offers.length;
    const settled = () => surplusOf(s, rosterNow(), boardWith);
    s.promises = new Map(offers.map(h => [h.offer.p.id, h.promise]));
    for (let i = offers.length - 1; i >= 0; i--) {
      const h = offers[i];
      if (!h.cut || settled().roster.length >= 85) continue;
      if (h.cut.kind === "recruit" && boardWith(settled().removed.length) <= 0) continue;
      if (settled().roster.filter(x => x.room === h.cut.room).length >= (PARAMETERS.roomCaps[h.cut.room] ?? Infinity)) continue;
      out.delete(h.cut.id);
      if (violations(s, settled().roster).length) { out.add(h.cut.id); continue; }
      h.cut = null; restoredReleases++;
    }
    const result = settled();
    s.roster = result.roster; s.heldSurplus = result.removed; s.n = offers.length;
    s.replacements = offers.filter(h => h.cut?.kind === "veteran").length;
    s.surplusReleases = s.baseSurplus + result.removed.length;
    s.recruitReleases = offers.filter(h => h.cut?.kind === "recruit").length + s.surplusReleases;
    refresh(s);
  };
  for (const s of states) { s.base = [...s.roster]; s.baseSurplus = s.surplusReleases; s.heldSurplus = []; }

  // touched: rooms the school's earlier offers this round add to or release from.
  const checkOffer = (stored, s, touched) => {
    assert.ok(s, "No user-school or unknown-school offer");
    const p = remaining.get(stored.id); assert.ok(p, `${stored.name}: offered before acceptance only`);
    assert.ok(!touched.has(p.room), `${p.name}/${s.team.name}: room untouched by the school's earlier offers`);
    const options = enumerate(s, p).variants.filter(v => !v.cut || !touched.has(v.cut.room)); stats.verifiedOfferCutVariants += options.length;
    const selected = options.filter(v => v.feasible).sort(chosenVariant)[0];
    assert.ok(selected, `${p.name}/${s.team.name}: offer is mutually feasible`);
    assert.equal(stored.cut?.id ?? null, selected.cut?.id ?? null, `${p.name}/${s.team.name}: highest-net feasible cut`);
    assert.equal(stored.n, s.n, `${p.name}: quoted acquisition count`);
    const cost = selected.cost + .5 * stored.k, net = selected.net - .5 * stored.k;
    const priority = net + pair(p, s).schoolTaste;
    for (const [key, value] of Object.entries({ gain1: selected.gain1, gain2: selected.gain2, gain: selected.gain,
      cost, net, priority, cutLoss: selected.cutLoss })) number(stored[key], value, `${p.name}: ${key}`);
    assert.ok(cmp(net, 0) > 0, `${p.name}: reserved quote remains worthwhile`);
    for (const key of ["O1", "F", "U", "outside"]) number(stored.value[key], selected.value[key], `${p.name}: ${key}`);
    assert.equal(stored.value.O2, selected.value.O2, `${p.name}: O2`);
    return { ...selected, cost, net, priority, stored };
  };

  for (const [roundIndex, round] of plan.rounds.entries()) {
    // The empty round that lifts the QB reserve uses up one round number and records nothing.
    const expectedRound = roundIndex + 1 + (reserveLifted ? 1 : 0);
    if (round.round !== expectedRound) {
      assert.ok(!reserveLifted && reservedQBs.size && round.round === expectedRound + 1, "Consecutive round identities");
      reserveLifted = true;
    }
    onProgress(`Checking round ${round.round}/${plan.rounds.length}`);
    const actual = new Map(), schoolOffers = new Map(), touchedRooms = new Map();
    const heldU = new Map([...held].map(([id, h]) => [id, currentU(h.offer.p, byTeam.get(h.offer.teamIndex))]));
    for (const stored of [...round.offers].sort((a, b) => a.teamIndex - b.teamIndex || a.k - b.k)) {
      if (!touchedRooms.has(stored.teamIndex)) touchedRooms.set(stored.teamIndex, new Set());
      const s = byTeam.get(stored.teamIndex), touched = touchedRooms.get(stored.teamIndex), verified = checkOffer(stored, s, touched);
      assert.ok(!tried.has(`${stored.id}|${stored.teamIndex}`), `${stored.name}/${s.team.name}: each pair is offered at most once`);
      if (heldU.has(stored.id)) assert.ok(cmp(verified.value.U, heldU.get(stored.id)) > 0, `${stored.name}/${s.team.name}: offer beats his current hold`);
      if (!offersByPlayer.has(stored.id)) offersByPlayer.set(stored.id, []);
      offersByPlayer.get(stored.id).push(stored.teamIndex);
      touched.add(verified.p.room); if (verified.cut) touched.add(verified.cut.room);
      if (!actual.has(stored.id)) actual.set(stored.id, []);
      actual.get(stored.id).push(verified);
      if (!schoolOffers.has(stored.teamIndex)) schoolOffers.set(stored.teamIndex, []);
      schoolOffers.get(stored.teamIndex).push(verified); stats.offers++;
    }
    assert.ok(actual.size > 0, "Every recorded round is productive");
    for (const [teamIndex, offers] of schoolOffers) {
      const s = byTeam.get(teamIndex);
      assert.equal(new Set(offers.map(o => o.p.room)).size, offers.length, `${s.team.name}: distinct reserved rooms`);
      assert.equal(new Set(offers.map(o => o.p.id)).size, offers.length, `${s.team.name}: distinct offers`);
      const cap = freeBoard(s) <= 0 ? recruitMode(s) ? recruitReleaseLimitFor(s.team) - contingentReleases(s) : 0
        : Math.min(freeBoard(s), s.roster.length < 85 ? 85 - s.roster.length : replacementLimitFor(s.team) - s.replacements);
      if (freeBoard(s) <= 0) assert.ok(offers.every(o => o.cut?.kind === "recruit"), `${s.team.name}: full board offers release a recruit`);
      assert.ok(offers.length <= cap, `${s.team.name}: capacity reserved for every offer`);
      offers.forEach((offer, k) => assert.equal(offer.stored.k, k, `${s.team.name}: reservation order`));
      if (s.roster.length < 85 && freeBoard(s) > 0) assert.ok(offers.every(o => !o.cut), "No gratuitous cut below capacity");
      // Verify reservation order among all offers actually issued by this school,
      // repricing each later quote at the earlier k. This is not a claim that
      // unissued alternatives were fully priority-verified in every round.
      for (let k = 0; k < offers.length; k++) for (const later of offers.slice(k + 1)) {
        const rebate = .5 * (later.stored.k - k);
        assert.ok(chosenBySchool(offers[k], { ...later, net: later.net + rebate, priority: later.priority + rebate }) <= 0,
          `${s.team.name}: priority order among actual offers`);
      }
    }
    const selected = [...actual.values()].map(offers => offers.sort(chosenByPlayer)[0]);
    assert.deepEqual([...round.accepted].sort(byId).map(o => [o.id, o.teamIndex]),
      selected.sort((a, b) => byId(a.p, b.p)).map(o => [o.p.id, o.teamIndex]), "Best actual offer accepted exactly once");
    // All checkOffer calls above precede every mutation of this round's states.
    for (const offers of actual.values()) for (const o of offers) tried.add(`${o.p.id}|${o.teamIndex}`);
    const changed = new Set();
    for (const offer of selected) {
      const p = offer.p, previous = held.get(p.id);
      if (previous) { tradeUps++; changed.add(previous.offer.teamIndex); }
      const contract = offer.depthFloor ? "depth floor" : p.E >= 2 && cmp(offer.value.O1, 35) < 0 ? "developmental reserve" : "immediate opportunity";
      held.set(p.id, { offer, cut: offer.cut, round: round.round, sequence: ++holdSequence, promise: { ...offer.value, E: p.E, contract } });
      changed.add(offer.teamIndex); stats.accepted++;
    }
    for (const teamIndex of [...changed].sort((a, b) => a - b)) {
      const s = byTeam.get(teamIndex);
      rebuild(s);
      assert.ok(s.roster.length <= 85, `${s.team.name}: roster cap`);
      assert.ok(freeBoard(s) >= 0, `${s.team.name}: board cap`);
      assert.ok(s.replacements <= replacementLimitFor(s.team), `${s.team.name}: replacement cap`);
      assert.ok(contingentReleases(s) <= recruitReleaseLimitFor(s.team), `${s.team.name}: recruit-release cap`);
      for (const room of ROOMS) assert.ok(s.rooms[room].length >= s.coverage[room], `${s.team.name}: ${room} coverage`);
      assert.deepEqual(violations(s, s.roster), [], `${s.team.name}: original promises preserved`);
    }
    stats.rounds++;
  }
  reserveLifted = true;
  // Every hold standing when the market ends is the final commitment.
  for (const [id, h] of held) {
    const p = h.offer.p, placement = placementById.get(id), teamIndex = h.offer.teamIndex;
    assert.ok(placement, `${p.name}: placement recorded`);
    assert.equal(placement.teamIndex, teamIndex, `${p.name}: final destination`);
    assert.equal(placement.round, h.round, `${p.name}: round of his final hold`);
    assert.equal(placement.contract, h.promise.contract, `${p.name}: frozen contract`);
    for (const key of ["O1", "F", "U", "outside"]) number(placement.original[key], h.offer.value[key], `${p.name}: original ${key}`);
    sameIds(placement.actualOffers.map(o => o.teamIndex), offersByPlayer.get(id), `${p.name}: every offer he received`);
    const recorded = plan.cuts.filter(c => c.kind !== "baseline" && c.forId === id);
    assert.deepEqual(recorded.map(c => c.id), h.cut ? [h.cut.id] : [], `${p.name}: contingent release`);
    if (h.cut) {
      assert.equal(recorded[0].kind, h.cut.kind === "recruit" ? "recruit" : "replacement", `${p.name}: release kind`);
      assert.equal(recorded[0].roomCountBefore, h.offer.cutRoomCount, `${p.name}: release room count`);
    }
    remaining.delete(id);
  }
  assert.equal(plan.summary.tradeUps, tradeUps, "Trade-ups replay");
  assert.equal(plan.summary.restoredReleases, restoredReleases, "Returned releases replay");
  sameIds(remaining.keys(), plan.unplaced.map(p => p.id), "Remaining pool after replay");
  for (const s of states) {
    sameIds(plan.cuts.filter(c => c.teamIndex === s.team.index && c.reason === "surplus" && c.round !== 0).map(c => c.id), s.heldSurplus, `${s.team.name}: surplus releases at the final holds`);
    stats.surplusReleases += s.heldSurplus.length;
  }
  assert.equal(stats.surplusReleases, plan.summary.surplusReleases, "Surplus summary");
  assert.equal(stats.baselineCuts + [...states].reduce((n, s) => n + s.replacements + s.recruitReleases, 0), plan.cuts.length, "Every cut accounted for");
  for (const s of states) {
    const t = plan.teams.find(t => t.teamIndex === s.team.index); assert.ok(t, "Every CPU school reported");
    sameIds(t.roster, s.roster.map(p => p.id), `${s.team.name}: final roster replay`);
    assert.equal(t.acquired, s.n); assert.equal(t.replacements, s.replacements); assert.equal(t.recruitReleases, s.recruitReleases);
    assert.equal(t.surplusReleases, s.surplusReleases);
    assert.equal(t.boardUsed, s.team.boardCapacity - freeBoard(s)); assert.equal(!!t.excluded, s.excluded);
    assert.deepEqual(t.coverage, s.coverage); assert.deepEqual(violations(s, s.roster), []);
    for (const [id] of s.promises) {
      const p = players.get(id), final = placementById.get(id).final;
      const value = utility(p, s.rooms[p.room], s.slots[p.room], pt.get(id), pair(p, s));
      for (const key of ["O1", "F", "U", "outside"]) number(final[key], value[key], `${p.name}: final ${key}`);
    }
  }
  const boardInspect = new Set([...remaining.values()].sort((a, b) => b.overall - a.overall || byId(a, b)).slice(0, 10).map(p => p.id));
  for (const p of remaining.values()) if (p.overall >= 85) boardInspect.add(p.id);
  let examined = 0;
  for (const p of remaining.values()) {
    const boardOnly = [];
    for (const s of states) {
      const result = enumerate(s, p); stats.finalPairs++;
      if (result.structural) stats.finalStructurallyEligiblePairs++;
      stats.finalTransactions += result.variants.length;
      stats.finalCutVariants += result.variants.filter(v => v.cut).length;
      const feasible = result.variants.filter(v => v.feasible);
      if (feasible.length) {
        stats.finalFeasiblePairs++; stats.finalFeasibleTransactions += feasible.length;
        residual.push({ player: p.name, id: p.id, team: s.team.name, variants: feasible.map(v => ({ cut: v.cut?.id ?? null, net: v.net, U: v.value.U })) });
      }
      if (boardInspect.has(p.id) && freeBoard(s) <= 0) {
        const options = enumerate(s, p, { ignoreBoard: true }).variants.filter(v => v.feasible).sort(chosenVariant);
        if (options.length) boardOnly.push({ teamIndex: s.team.index, cut: options[0].cut?.id ?? null });
      }
    }
    if (boardInspect.has(p.id)) {
      const stored = plan.unplaced.find(x => x.id === p.id).boardOnlyVetoes;
      assert.deepEqual(stored.map(o => ({ teamIndex: o.teamIndex, cut: o.cut?.id ?? null })).sort((a, b) => a.teamIndex - b.teamIndex),
        boardOnly.sort((a, b) => a.teamIndex - b.teamIndex), `${p.name}: complete board-only counterfactuals`);
      stats.boardOnlyPairs += boardOnly.length;
    }
    if (++examined % 200 === 0) onProgress(`Final enumeration: ${examined}/${remaining.size} candidates`);
  }
  return { passed: residual.length === 0, stats, residual,
    scope: "Independent baseline replay, every actual offer's full cut variants and quote, one offer per pair, offers beating the current hold, priority order among issued offers, player choice, hold rebuilds with returned releases, original/final promises, and complete final feasible-transaction enumeration for unplaced players. Shared pure formula functions; no planner evaluator or feasibility cache.",
    limits: "Does not prove formulas empirically realistic or verify all unissued school-priority alternatives in every historical round. Does not write or validate in-game rollover." };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); assert.ok(i >= 0 && process.argv[i + 1], `${name} is required`); return path.resolve(process.argv[i + 1]); };
  const planFile = arg("--plan"), source = arg("--source");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  fs.mkdirSync(path.join(root, "test_runs"), { recursive: true });
  const work = fs.mkdtempSync(path.join(root, "test_runs", "market-verify-"));
  const started = Date.now(), sourceHash = hashFile(source), plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  try {
    assert.equal(sourceHash, plan.binding.sourceHash, "Use the original snapshot/backup, not an already applied save");
    const { id, ms, ...body } = plan; assert.equal(id, digest(body), "Untampered reviewed plan");
    const d = await Dynasty.load(source), input = buildMarketInput(d, plan.userTeamIndex);
    const report = verifyMarket(input, plan, { onProgress: message => console.log(message) });
    assert.equal(hashFile(source), sourceHash, "Source save remains unchanged");
    Object.assign(report, { planId: plan.id, seed: plan.seed, source, sourceHash, planFile, elapsedMs: Date.now() - started });
    fs.writeFileSync(path.join(work, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, residual: report.residual.slice(0, 5), report: path.join(work, "report.json") }, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    fs.writeFileSync(path.join(work, "report.json"), JSON.stringify({ passed: false, error: error.stack, source, sourceHash, planFile, elapsedMs: Date.now() - started }, null, 2));
    console.error(error.stack); console.error(`Failure report: ${path.join(work, "report.json")}`); process.exitCode = 1;
  }
}
