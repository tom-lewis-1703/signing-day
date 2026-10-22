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
  pairTraits, roomValue, utility, promiseFailures, cmp, byId, releasableRecruit, PARAMETERS } from "../lib/market-model.mjs";

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
  const pt = new Map([...remaining.values()].map(p => [p.id, playerTraits(p, draw)]));
  const locks = plan.binding?.locks ?? { keep: [], notAt: [] };
  const keep = new Set(locks.keep), notAt = new Map(locks.notAt.map(([id, teams]) => [id, new Set(teams)]));
  const stats = { baselineCuts: 0, offers: 0, accepted: 0, rounds: 0, verifiedOfferCutVariants: 0,
    finalPairs: 0, finalStructurallyEligiblePairs: 0, finalTransactions: 0, finalCutVariants: 0,
    finalFeasiblePairs: 0, finalFeasibleTransactions: 0, promiseChecks: 0, boardOnlyPairs: 0 };
  const residual = [], placementById = new Map(plan.placements.map(p => [p.id, p]));
  assert.equal(placementById.size, plan.placements.length, "No repeated signer");
  assert.equal(new Set(plan.unplaced.map(p => p.id)).size, plan.unplaced.length, "No repeated unplaced candidate");
  sameIds([...plan.placements, ...plan.unplaced].map(p => p.id), input.candidates, "Complete candidate partition");
  assert.deepEqual(plan.withdrawals, input.withdrawals, "Complete original CPU withdrawal list");

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
  const recruitMode = s => freeBoard(s) <= 0 && s.recruitReleases < PARAMETERS.recruitReleaseLimit && s.recruits.length > 0;
  const states = input.teams.filter(t => t.index !== input.userTeamIndex).map(team => {
    const s = { team, slots: slotsFor(team).rooms, traits: schoolTraits(team, draw),
      roster: team.roster.map(id => players.get(id)), n: 0, replacements: 0, recruitReleases: 0,
      promises: new Map(), pairs: new Map(), coverage: {}, excluded: false };
    assert.ok(s.roster.every(Boolean), `${team.name}: known roster identities`);
    assert.ok(s.roster.every(p => !remaining.has(p.id)), `${team.name}: CPU withdrawals normalized`);
    refresh(s);
    for (const room of ROOMS) s.coverage[room] = Math.min(s.rooms[room].length,
      s.slots[room].S ? s.slots[room].S + 1 : s.slots[room].support);
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
      (!releasing && s.roster.length === 85 && s.replacements >= 3)) return { structural: false, variants: [] };
    const adding = [...s.rooms[p.room], p], valueAdded = roomValue(adding, s.slots[p.room]);
    const opportunityAdded = utility(p, adding, s.slots[p.room], pt.get(p.id), pair(p, s));
    const incomingPromises = [...s.promises.entries()].filter(([id]) => players.get(id).room === p.room);
    const promiseOkay = room => incomingPromises.every(([id, promise]) => {
      const prior = players.get(id); stats.promiseChecks++;
      return !promiseFailures(promise, utility(prior, room, s.slots[p.room], pt.get(id), pair(prior, s))).length;
    });
    const additionPromises = promiseOkay(adding), variants = [];
    for (const cut of releasing ? s.recruits : s.roster.length < 85 ? [null] : s.veterans) {
      if (cut && cut.p.room !== p.room && s.rooms[cut.p.room].length - 1 < s.coverage[cut.p.room]) continue;
      const sameRoom = cut?.p.room === p.room;
      const room = sameRoom ? adding.filter(x => x.id !== cut.p.id) : adding;
      if (room.length < s.coverage[p.room]) continue;
      const roomAfter = sameRoom ? roomValue(room, s.slots[p.room]) : valueAdded;
      const gain1 = roomAfter.V1 - s.values[p.room].V1 - (cut && !sameRoom ? cut.loss1 : 0);
      const gain2 = roomAfter.V2 - s.values[p.room].V2 - (cut && !sameRoom ? cut.loss2 : 0);
      const gain = gain1 + s.traits.delta * gain2, cost = 4 + .5 * s.n + (cut ? s.traits.cutSurcharge : 0);
      const value = sameRoom ? utility(p, room, s.slots[p.room], pt.get(p.id), pair(p, s)) : opportunityAdded;
      const promisesOkay = sameRoom ? promiseOkay(room) : additionPromises;
      variants.push({ p, teamIndex: s.team.index, cut: cut?.p ?? null, cutLoss: cut?.loss ?? 0,
        gain1, gain2, gain, cost, net: gain - cost, value,
        feasible: cmp(gain - cost, 0) > 0 && cmp(value.U, pt.get(p.id).outside) > 0 && promisesOkay });
    }
    return { structural: true, variants };
  };
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
    const cost = selected.cost + .5 * stored.k, net = selected.gain - cost;
    const priority = net + pair(p, s).schoolTaste;
    for (const [key, value] of Object.entries({ gain1: selected.gain1, gain2: selected.gain2, gain: selected.gain,
      cost, net, priority, cutLoss: selected.cutLoss })) number(stored[key], value, `${p.name}: ${key}`);
    assert.ok(cmp(net, 0) > 0, `${p.name}: reserved quote remains worthwhile`);
    for (const key of ["O1", "F", "U", "outside", "ordinaryU"]) number(stored.value[key], selected.value[key], `${p.name}: ${key}`);
    assert.equal(stored.value.O2, selected.value.O2, `${p.name}: O2`);
    return { ...selected, cost, net, priority, stored };
  };

  for (const [roundIndex, round] of plan.rounds.entries()) {
    assert.equal(round.round, roundIndex + 1, "Consecutive round identities");
    onProgress(`Checking round ${round.round}/${plan.rounds.length}`);
    const actual = new Map(), schoolOffers = new Map(), touchedRooms = new Map();
    for (const stored of [...round.offers].sort((a, b) => a.teamIndex - b.teamIndex || a.k - b.k)) {
      if (!touchedRooms.has(stored.teamIndex)) touchedRooms.set(stored.teamIndex, new Set());
      const s = byTeam.get(stored.teamIndex), touched = touchedRooms.get(stored.teamIndex), verified = checkOffer(stored, s, touched);
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
      const cap = freeBoard(s) <= 0 ? recruitMode(s) ? PARAMETERS.recruitReleaseLimit - s.recruitReleases : 0
        : Math.min(freeBoard(s), s.roster.length < 85 ? 85 - s.roster.length : 3 - s.replacements);
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
    const batches = new Map();
    for (const offer of selected) {
      if (!batches.has(offer.teamIndex)) batches.set(offer.teamIndex, []);
      batches.get(offer.teamIndex).push(offer);
    }
    // All checkOffer calls above precede every mutation of this round's states.
    for (const [teamIndex, offers] of batches) {
      const s = byTeam.get(teamIndex), cutIds = new Set(offers.filter(o => o.cut).map(o => o.cut.id));
      const veteranCuts = offers.filter(o => o.cut?.kind === "veteran").length, recruitCuts = cutIds.size - veteranCuts;
      const after = [...s.roster.filter(p => !cutIds.has(p.id)), ...offers.map(o => o.p)];
      assert.ok(after.length <= 85, `${s.team.name}: actual batch roster cap`);
      assert.ok(offers.length - recruitCuts <= freeBoard(s), `${s.team.name}: actual batch board cap`);
      assert.ok(s.replacements + veteranCuts <= 3, `${s.team.name}: replacement cap`);
      assert.ok(s.recruitReleases + recruitCuts <= PARAMETERS.recruitReleaseLimit, `${s.team.name}: recruit-release cap`);
      for (const room of ROOMS) assert.ok(after.filter(p => p.room === room).length >= s.coverage[room], `${s.team.name}: ${room} coverage`);
      assert.deepEqual(violations(s, after), [], `${s.team.name}: original promises preserved by batch`);
      for (const offer of offers) {
        const p = offer.p, placement = placementById.get(p.id);
        assert.ok(placement, `${p.name}: placement recorded`);
        assert.equal(placement.teamIndex, teamIndex, `${p.name}: selected destination`);
        assert.equal(placement.round, round.round, `${p.name}: signing round`);
        sameIds(placement.promiseRoster, after.map(p => p.id), `${p.name}: actual full promise snapshot`);
        const value = utility(p, after.filter(x => x.room === p.room), s.slots[p.room], pt.get(p.id), pair(p, s));
        for (const key of ["O1", "F", "U", "outside", "ordinaryU"]) number(placement.original[key], value[key], `${p.name}: original ${key}`);
        const contract = p.E >= 2 && cmp(value.O1, 35) < 0 ? "developmental reserve" : "immediate opportunity";
        assert.equal(placement.contract, contract, `${p.name}: frozen contract`);
        assert.deepEqual(placement.actualOffers.map(o => [o.teamIndex, o.cut?.id ?? null]).sort(),
          actual.get(p.id).map(o => [o.teamIndex, o.cut?.id ?? null]).sort(), `${p.name}: actual alternatives`);
        if (offer.cut) {
          const recorded = plan.cuts.filter(c => c.kind === (offer.cut.kind === "recruit" ? "recruit" : "replacement") && c.forId === p.id);
          assert.equal(recorded.length, 1, `${p.name}: contingent release recorded once`);
          assert.equal(recorded[0].id, offer.cut.id, `${p.name}: accepted cut identity`);
          assert.equal(recorded[0].round, round.round, `${p.name}: cut round`);
        }
        s.promises.set(p.id, { ...value, E: p.E, contract });
        remaining.delete(p.id); stats.accepted++;
      }
      s.n += offers.length; s.replacements += veteranCuts; s.recruitReleases += recruitCuts; s.roster = after; refresh(s);
    }
    stats.rounds++;
  }
  sameIds(remaining.keys(), plan.unplaced.map(p => p.id), "Remaining pool after replay");
  assert.equal(stats.baselineCuts + [...states].reduce((n, s) => n + s.replacements + s.recruitReleases, 0), plan.cuts.length, "Every cut accounted for");
  for (const s of states) {
    const t = plan.teams.find(t => t.teamIndex === s.team.index); assert.ok(t, "Every CPU school reported");
    sameIds(t.roster, s.roster.map(p => p.id), `${s.team.name}: final roster replay`);
    assert.equal(t.acquired, s.n); assert.equal(t.replacements, s.replacements); assert.equal(t.recruitReleases, s.recruitReleases);
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
    scope: "Independent baseline replay, every actual offer's full cut variants and quote, priority order among issued offers, player choice, batches, original/final promises, and complete final feasible-transaction enumeration. Shared pure formula functions; no planner evaluator or feasibility cache.",
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
