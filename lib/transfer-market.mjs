// A complete standalone Signing Day market. Native CPU commitments are audit-only;
// market-input supplies rosters and board occupancy after their virtual withdrawal.
import { MODEL, PARAMETERS, Q, cmp, byId, ROOMS, forecast, slotsFor, drawFactory,
  schoolTraits, playerTraits, pairTraits, roomValue, utility, promiseFailures, rosterSnapshot, releasableRecruit } from "./market-model.mjs";
export { PARAMETERS as MODEL_PARAMETERS } from "./market-model.mjs";

const offerChoice = (a, b) => cmp(b.value.U, a.value.U) || cmp(b.value.O1, a.value.O1) || a.teamIndex - b.teamIndex;
const variantOrder = (a, b) => cmp(b.net, a.net) || Number(!!a.cut) - Number(!!b.cut) || (a.cut && b.cut ? byId(a.cut, b.cut) : 0);
const priorityOrder = (a, b) => cmp(b.priority, a.priority) || cmp(b.net, a.net) || byId(a.p, b.p);
const playerInfo = p => ({ id: p.id, index: p.index, name: p.name, position: p.position, overall: p.overall, E: p.E, q1: p.q1, q2: p.q2 });

export function planTransferMarket(input, { seed = `SigningDay-v1.2|${input.seasonYear}`, keep = new Set(), notAt = new Map() } = {}) {
  if (!Number.isInteger(input.userTeamIndex) || !input.teams.some(t => t.index === input.userTeamIndex)) throw new Error("Select a valid user team before planning.");
  const u = drawFactory(seed, input.seasonYear);
  const players = new Map(input.players.map(p => [p.id, forecast(p)]));
  const candidates = input.candidates.map(id => players.get(id)).sort(byId);
  if (candidates.some(p => !p || !p.room || p.E < 1)) throw new Error("The market input contains an ineligible candidate.");
  const remaining = new Map(candidates.map(p => [p.id, p]));
  const candidateIds = new Set(remaining.keys());
  const traits = new Map(candidates.map(p => [p.id, playerTraits(p, u)]));
  const pairCache = new Map();
  const states = [], cuts = [], placements = [], rounds = [], promiseBlocks = [];
  const ignoredKeep = [...keep].filter(i => candidates.some(p => p.index === i));
  const presentIndexes = new Set(input.players.map(p => p.index));
  const obsoleteLocks = [...new Set([...keep, ...notAt.keys()])].filter(i => !presentIndexes.has(i));

  const pairFor = (p, state) => {
    const key = `${p.id}:${state.team.index}`;
    if (!pairCache.has(key)) pairCache.set(key, pairTraits(p, state.team, traits.get(p.id), state.traits, u));
    return pairCache.get(key);
  };
  const refresh = state => {
    state.rooms = Object.fromEntries(ROOMS.map(r => [r, state.roster.filter(p => p.room === r)]));
    state.values = Object.fromEntries(ROOMS.map(r => [r, roomValue(state.rooms[r], state.slots[r])]));
    state.cache = new Map(); state.avoidCache = new Map();
    const removal = p => {
      const before = state.values[p.room], after = roomValue(state.rooms[p.room].filter(x => x.id !== p.id), state.slots[p.room]);
      return { p, loss1: before.V1 - after.V1, loss2: before.V2 - after.V2,
        loss: before.V1 - after.V1 + state.traits.delta * (before.V2 - after.V2),
        // Held transfers can still leave, so only players who are staying count toward the floor.
        preservesCoverage: state.rooms[p.room].filter(x => !candidateIds.has(x.id)).length - 1 >= state.coverage[p.room] };
    };
    const removable = p => p.room && !keep.has(p.index);
    state.cutOptions = state.roster.filter(p => p.kind === "veteran" && removable(p)).map(removal);
    state.recruitOptions = state.roster.filter(p => releasableRecruit(p) && removable(p)).map(removal);
  };
  // A released recruit frees his commitment-board slot.
  const freeBoard = state => state.team.boardCapacity - state.team.boardUsed + state.recruitReleases - state.n;
  const canReleaseRecruit = state => freeBoard(state) <= 0 && state.recruitReleases < PARAMETERS.recruitReleaseLimit && state.recruitOptions.length > 0;
  const cutEntry = (state, cut, kind, extra = {}) => ({ ...playerInfo(cut.p), teamIndex: state.team.index,
    team: state.team.name, kind, marginalLoss: cut.loss, loss1: cut.loss1, loss2: cut.loss2,
    coverageFloor: state.coverage[cut.p.room], roomCountBefore: state.rooms[cut.p.room].length, ...extra });

  for (const team of [...input.teams].sort((a, b) => a.index - b.index)) {
    if (team.index === input.userTeamIndex) continue;
    const modeledSlots = slotsFor(team);
    const roster = team.roster.map(id => players.get(id));
    if (roster.some(p => !p)) throw new Error(`${team.name}: an unknown player appears on its projected roster.`);
    if (roster.some(p => candidateIds.has(p.id))) throw new Error(`${team.name}: a market candidate is still on its post-withdrawal roster.`);
    const state = { team, slots: modeledSlots.rooms, schemeDefaults: { offense: modeledSlots.unknownOffense, defense: modeledSlots.unknownDefense },
      traits: schoolTraits(team, u), roster: [...roster], initial: [...roster], native: (team.nativeRoster ?? team.roster).map(id => players.get(id)),
      n: 0, replacements: 0, recruitReleases: 0, promises: new Map(), coverage: {}, excluded: null, baselineCuts: [] };
    for (const room of ROOMS) state.coverage[room] = Math.min(roster.filter(p => p.room === room).length, state.slots[room].S ? state.slots[room].S + 1 : state.slots[room].support);
    refresh(state);
    while (state.roster.length > PARAMETERS.rosterMax) {
      const choices = state.cutOptions.filter(c => c.preservesCoverage).sort((a, b) => cmp(a.loss, b.loss) || byId(a.p, b.p));
      if (!choices.length) {
        state.excluded = { reason: "Protected roster cannot be trimmed to 85", originalHeadcount: roster.length,
          excess: roster.length - 85, protectedRecruits: roster.filter(p => p.kind === "recruit").length,
          keepLocked: roster.filter(p => keep.has(p.index)).map(p => p.index), coverage: state.coverage };
        state.roster = [...roster]; state.baselineCuts = []; refresh(state); break;
      }
      const cut = choices[0]; state.baselineCuts.push(cutEntry(state, cut, "baseline"));
      state.roster = state.roster.filter(p => p.id !== cut.p.id); refresh(state);
    }
    cuts.push(...state.baselineCuts); states.push(state);
  }

  // The whole transaction is checked against each signer's original snapshot.
  // Only the incoming room can deteriorate; a cut in another room can only help it.
  const blockedPromises = (state, room, afterRoom) => {
    const failed = [];
    for (const promise of state.promises.values()) {
      if (promise.p.room !== room) continue;
      const value = utility(promise.p, afterRoom, state.slots[room], traits.get(promise.p.id), pairFor(promise.p, state));
      const reasons = promiseFailures(promise, value);
      if (reasons.length) failed.push({ id: promise.p.id, index: promise.p.index, name: promise.p.name, contract: promise.contract,
        futureHeavy: promise.futureHeavy, reasons, original: { O1: promise.O1, F: promise.F, U: promise.U, outside: promise.outside }, current: value });
    }
    return failed;
  };

  // avoidRooms: rooms another offer from this school already touches this round;
  // a contingent release may not come from them.
  const evaluate = (state, p, { ignoreBoard = false, ignoreReplacements = false, useCache = true, avoidRooms = null } = {}) => {
    const cache = avoidRooms ? state.avoidCache : state.cache;
    const key = avoidRooms ? `${p.id}|${[...avoidRooms].sort().join()}` : p.id;
    if (useCache && !ignoreBoard && cache.has(key)) return cache.get(key);
    const structural = [];
    if (state.excluded) structural.push("excluded school");
    if (notAt.get(p.index)?.has(state.team.index)) structural.push("destination lock");
    // A full board allows only an offer that releases one eligible recruit.
    const recruitRelease = !ignoreBoard && canReleaseRecruit(state);
    if (!ignoreBoard && freeBoard(state) <= 0 && !recruitRelease) structural.push("commitment board full");
    if (state.roster.length > 85) structural.push("roster over capacity");
    if (!ignoreReplacements && !recruitRelease && state.roster.length === 85 && state.replacements >= PARAMETERS.replacementLimit) structural.push("replacement allowance");
    if (structural.length) return { best: null, diagnostic: null, positiveUpgrade: null, reasons: structural };
    const room = p.room, before = state.values[room], originalRoom = state.rooms[room], slots = state.slots[room];
    const addedRoom = [...originalRoom, p], addition = roomValue(addedRoom, slots);
    // All cross-room cuts produce identical player utility and promise effects.
    // Keep the minimum-loss one for ordinary selection, plus the minimum-loss
    // positive-V1 variant for the separate promise-block diagnostic.
    let variants = [null];
    const pool = recruitRelease ? state.recruitOptions : state.roster.length === 85 ? state.cutOptions : null;
    if (pool) {
      const own = pool.filter(c => c.p.room === room);
      // A good veteran can only be released for a player at his own position.
      const cross = pool.filter(c => c.p.room !== room && c.preservesCoverage && !avoidRooms?.has(c.p.room) &&
        !(c.p.kind === "veteran" && c.p.overall >= PARAMETERS.crossRoomProtectedOverall)).sort((a, b) => cmp(a.loss, b.loss) || byId(a.p, b.p));
      const positiveCross = cross.find(c => cmp(addition.V1 - before.V1 - c.loss1, 0) > 0);
      variants = [...own, ...(cross[0] ? [cross[0]] : [])];
      if (positiveCross && positiveCross !== cross[0]) variants.push(positiveCross);
    }
    const evaluated = [];
    for (const cut of variants) {
      const afterRoom = cut?.p.room === room ? addedRoom.filter(x => x.id !== cut.p.id) : addedRoom;
      const valueAfter = cut?.p.room === room ? roomValue(afterRoom, slots) : addition;
      const gain1 = valueAfter.V1 - before.V1 - (cut && cut.p.room !== room ? cut.loss1 : 0);
      const gain2 = valueAfter.V2 - before.V2 - (cut && cut.p.room !== room ? cut.loss2 : 0);
      const gain = gain1 + state.traits.delta * gain2;
      const cost = 4 + .5 * state.n + (cut ? state.traits.cutSurcharge : 0), net = gain - cost;
      const value = utility(p, afterRoom, slots, traits.get(p.id), pairFor(p, state));
      const blockers = blockedPromises(state, room, afterRoom);
      evaluated.push({ p, teamIndex: state.team.index, cut: cut?.p ?? null, cutDetail: cut, gain1, gain2, gain, cost, net,
        n: state.n, k: 0, value, blockers, schoolWilling: cmp(net, 0) > 0,
        playerWilling: cmp(value.U, traits.get(p.id).outside) > 0, futureHeavy: cmp(state.traits.delta * gain2, .5 * gain) > 0 });
    }
    evaluated.sort(variantOrder);
    const best = evaluated.find(v => v.schoolWilling && v.playerWilling && !v.blockers.length) ?? null;
    const diagnostic = evaluated[0] ?? null;
    const positiveVariants = evaluated.filter(v => cmp(v.gain1, 0) > 0 && v.schoolWilling && v.playerWilling);
    const positiveUpgrade = positiveVariants.length && !positiveVariants.some(v => !v.blockers.length) ? positiveVariants[0] : null;
    const reasons = diagnostic ? [!diagnostic.schoolWilling && "school value", !diagnostic.playerWilling && "outside option", diagnostic.blockers.length && "prior promises"].filter(Boolean)
      : [recruitRelease ? "coverage or protected recruits" : "coverage or protected veterans"];
    const highestUtility = evaluated.reduce((best, v) => !best || offerChoice(v, best) < 0 ? v : best, null);
    const result = { best, diagnostic, highestUtility, positiveUpgrade, reasons };
    if (useCache && !ignoreBoard) cache.set(key, result);
    return result;
  };

  // Below 85 a school reserves a roster slot per offer; at 85 each offer carries
  // its own contingent release, up to the remaining replacement allowance; with a
  // full board each offer releases a recruit, up to the recruit-release limit. No
  // two offers from one school touch the same room, counting a release's room, so
  // every quote, utility and promise check holds for any subset of holds.
  const offerCap = state => freeBoard(state) <= 0
    ? canReleaseRecruit(state) ? PARAMETERS.recruitReleaseLimit - state.recruitReleases : 0
    : Math.min(freeBoard(state), state.roster.length < 85 ? 85 - state.roster.length : PARAMETERS.replacementLimit - state.replacements);
  const touchedBy = offers => new Set(offers.flatMap(o => o.cut ? [o.p.room, o.cut.room] : [o.p.room]));
  const quoteAt = (state, choice, k, touched) => {
    if (touched.has(choice.p.room)) return null;
    const base = choice.cut && touched.has(choice.cut.room) ? evaluate(state, choice.p, { avoidRooms: touched }).best : choice;
    if (!base || cmp(base.net - .5 * k, 0) <= 0) return null;
    const net = base.net - .5 * k;
    return { ...base, k, cost: base.cost + .5 * k, net, priority: net + pairFor(base.p, state).schoolTaste };
  };
  const selectOffers = (state, choices) => {
    const selected = [];
    for (let k = 0; k < offerCap(state); k++) {
      const touched = touchedBy(selected);
      let best = null;
      for (const choice of choices) {
        const quote = quoteAt(state, choice, k, touched);
        if (quote && (!best || priorityOrder(quote, best) < 0)) best = quote;
      }
      if (!best) break;
      selected.push(best);
    }
    return selected;
  };
  const traceOffer = (offer, state) => ({ ...playerInfo(offer.p), teamIndex: state.team.index, team: state.team.name,
    cut: offer.cut ? playerInfo(offer.cut) : null, cutLoss: offer.cutDetail?.loss ?? 0,
    gain: offer.gain, gain1: offer.gain1, gain2: offer.gain2, d: state.traits.d, delta: state.traits.delta,
    n: offer.n, k: offer.k, cost: offer.cost, net: offer.net, priority: offer.priority ?? offer.net + pairFor(offer.p, state).schoolTaste,
    value: offer.value, opportunity: offer.value.O1, utility: offer.value.U, outside: offer.value.outside,
    futureHeavy: offer.futureHeavy,
    comparison: { gain: Q(offer.gain), cost: Q(offer.cost), net: Q(offer.net), priority: Q(offer.priority ?? offer.net + pairFor(offer.p, state).schoolTaste) } });

  // Schools propose; a player holds his best offer and may trade up until the market
  // ends. A school never re-offers a player who declined or left it, so each pair is
  // issued at most once and the market terminates.
  const stateByIndex = new Map(states.map(s => [s.team.index, s]));
  for (const state of states) state.base = [...state.roster];
  const held = new Map(), tried = new Set(), offerLog = new Map(), holdLog = new Map();
  const tryKey = (id, teamIndex) => `${id}|${teamIndex}`;
  let holdSequence = 0, tradeUps = 0, restoredReleases = 0;
  // Rebuilds a school from its current holds. A departed holder's contingent release
  // returns with him; another holder's release that is no longer needed also returns,
  // unless that would break a current holder's original promise.
  const rebuild = state => {
    const offers = [...held.values()].filter(o => o.teamIndex === state.team.index).sort((a, b) => a.sequence - b.sequence);
    const released = new Set(offers.filter(o => o.cut).map(o => o.cut.id));
    const rosterWith = () => [...state.base.filter(p => !released.has(p.id)), ...offers.map(o => o.p)];
    const board = () => state.team.boardCapacity - state.team.boardUsed + offers.filter(o => o.cut?.kind === "recruit").length - offers.length;
    const promises = new Map(offers.map(o => [o.p.id, o.promise]));
    for (const offer of [...offers].reverse()) {
      if (!offer.cut || rosterWith().length >= 85) continue;
      if (offer.cut.kind === "recruit" && board() <= 0) continue;
      released.delete(offer.cut.id);
      const roster = rosterWith();
      const breaks = [...promises.values()].some(promise => promise.p.room === offer.cut.room &&
        promiseFailures(promise, utility(promise.p, roster.filter(x => x.room === promise.p.room), state.slots[promise.p.room], traits.get(promise.p.id), pairFor(promise.p, state))).length);
      if (breaks) { released.add(offer.cut.id); continue; }
      offer.cut = null; offer.cutDetail = null; restoredReleases++;
    }
    state.roster = rosterWith();
    state.n = offers.length;
    state.replacements = offers.filter(o => o.cut?.kind === "veteran").length;
    state.recruitReleases = offers.filter(o => o.cut?.kind === "recruit").length;
    state.promises = promises;
    refresh(state);
  };
  const currentUtility = (p, state) => utility(p, state.rooms[p.room], state.slots[p.room], traits.get(p.id), pairFor(p, state));

  for (let round = 1; ; round++) {
    const issued = [], selectedBySchool = new Map(), roundBlocks = [], heldU = new Map();
    for (const [id, hold] of held) heldU.set(id, currentUtility(hold.p, stateByIndex.get(hold.teamIndex)).U);
    for (const state of states) {
      if (state.excluded || offerCap(state) <= 0) continue;
      const choices = [];
      for (const p of remaining.values()) {
        if (tried.has(tryKey(p.id, state.team.index))) continue;
        const result = evaluate(state, p);
        // A school only offers a player who would prefer it to what he holds.
        if (result.best && (!heldU.has(p.id) || cmp(result.best.value.U, heldU.get(p.id)) > 0)) choices.push(result.best);
        if (result.positiveUpgrade && !held.has(p.id)) {
          const v = result.positiveUpgrade;
          roundBlocks.push({ round, ...traceOffer(v, state), blockers: v.blockers });
        }
      }
      const selected = selectOffers(state, choices);
      issued.push(...selected);
      selectedBySchool.set(state.team.index, selected);
    }
    promiseBlocks.push(...roundBlocks);
    if (!issued.length) break;
    if (round > candidates.length * states.length) throw new Error("Market exceeded its strict termination bound.");
    const actual = new Map();
    for (const offer of issued) {
      if (!actual.has(offer.p.id)) actual.set(offer.p.id, []);
      actual.get(offer.p.id).push(offer);
      tried.add(tryKey(offer.p.id, offer.teamIndex));
    }
    const roundRecord = { round, offers: [], accepted: [], schoolsWithMultipleOffers: [...selectedBySchool.values()].filter(s => s.length > 1).length };
    for (const state of states) for (const offer of selectedBySchool.get(state.team.index) ?? []) {
      const trace = traceOffer(offer, state);
      roundRecord.offers.push(trace);
      if (!offerLog.has(offer.p.id)) offerLog.set(offer.p.id, []);
      offerLog.get(offer.p.id).push({ ...trace, round });
    }
    const changed = new Set();
    for (const offers of [...actual.values()].sort((a, b) => byId(a[0].p, b[0].p))) {
      const offer = [...offers].sort(offerChoice)[0], p = offer.p, previous = held.get(p.id);
      if (previous) { tradeUps++; changed.add(previous.teamIndex); }
      const contract = p.E >= 2 && cmp(offer.value.O1, 35) < 0 ? "developmental reserve" : "immediate opportunity";
      held.set(p.id, { ...offer, round, sequence: ++holdSequence,
        promise: { p, ...offer.value, E: p.E, contract, futureHeavy: offer.futureHeavy } });
      if (!holdLog.has(p.id)) holdLog.set(p.id, []);
      holdLog.get(p.id).push({ round, teamIndex: offer.teamIndex, team: stateByIndex.get(offer.teamIndex).team.name, utility: offer.value.U });
      changed.add(offer.teamIndex);
      roundRecord.accepted.push({ id: p.id, index: p.index, teamIndex: offer.teamIndex, previousTeamIndex: previous?.teamIndex ?? null });
    }
    for (const index of [...changed].sort((a, b) => a - b)) rebuild(stateByIndex.get(index));
    for (const state of states) {
      if (state.roster.length > 85 && !state.excluded) throw new Error(`${state.team.name}: holds exceed the roster limit.`);
      if (freeBoard(state) < 0) throw new Error(`${state.team.name}: holds exceed the commitment board.`);
      if (state.replacements > PARAMETERS.replacementLimit) throw new Error(`${state.team.name}: holds exceed the replacement allowance.`);
      if (state.recruitReleases > PARAMETERS.recruitReleaseLimit) throw new Error(`${state.team.name}: holds exceed the recruit-release limit.`);
    }
    rounds.push(roundRecord);
  }

  // The market is over: every hold becomes the player's final commitment.
  for (const hold of [...held.values()].sort((a, b) => a.round - b.round || a.teamIndex - b.teamIndex || byId(a.p, b.p))) {
    const p = hold.p, state = stateByIndex.get(hold.teamIndex), pt = traits.get(p.id), pair = pairFor(p, state);
    const value = currentUtility(p, state);
    if (promiseFailures(hold.promise, value).length) throw new Error(`${state.team.name}: final roster violates ${p.name}'s original promise.`);
    const offers = offerLog.get(p.id);
    const ordinary = offers.filter(o => cmp(o.value.ordinaryU, pt.outside) > 0)
      .sort((a, b) => cmp(b.value.ordinaryU, a.value.ordinaryU) || cmp(b.value.O1, a.value.O1) || a.teamIndex - b.teamIndex)[0] ?? null;
    const ordinaryRejectsAccepted = cmp(value.ordinaryU, pt.outside) <= 0;
    const ordinaryChoiceChanged = (ordinary?.teamIndex ?? null) !== state.team.index;
    const placement = { ...traceOffer(hold, state), fromTeamIndex: p.prevTeamIndex, round: hold.round, contract: hold.promise.contract,
      traits: pt, simulatedPair: pair, original: hold.value, final: null, actualOffers: offers, holds: holdLog.get(p.id),
      lifestyleCounterfactual: { applicable: pt.rareLifestyle, ordinaryRejectsAccepted, ordinaryChoiceChanged,
        ordinaryChoice: ordinary?.teamIndex ?? null, decisive: pt.rareLifestyle && (ordinaryRejectsAccepted || ordinaryChoiceChanged),
        alternatives: offers.map(o => ({ teamIndex: o.teamIndex, O1: o.value.O1, U: o.value.U, ordinaryU: o.value.ordinaryU, outside: pt.outside })) },
      missedPreferenceGap: 0, betterSchool: null };
    placements.push(placement);
    hold.promise.placement = placement;
    state.promises.set(p.id, hold.promise);
    if (hold.cut) cuts.push(cutEntry(state, hold.cutDetail, hold.cut.kind === "recruit" ? "recruit" : "replacement",
      { round: hold.round, forId: p.id, forIndex: p.index, forName: p.name, ...(hold.cut.kind === "recruit" ? { stars: hold.cut.stars, dev: hold.cut.dev } : {}) }));
    remaining.delete(p.id);
  }

  // Compares each signer's final school with every other school at the final rosters.
  // openAtEnd: the school could still legally sign him (he turned it down earlier).
  // Otherwise the school wanted him but had no roster, board or replacement capacity left.
  for (const placement of placements) {
    const p = players.get(placement.id), own = stateByIndex.get(placement.teamIndex), mine = currentUtility(p, own).U;
    for (const state of states) {
      if (state === own) continue;
      const open = evaluate(state, p, { useCache: false }).best;
      const best = open ?? evaluate(state, p, { ignoreBoard: true, ignoreReplacements: true, useCache: false }).best;
      if (!best || cmp(best.value.U, mine) <= 0) continue;
      const betterSchool = { teamIndex: state.team.index, team: state.team.name, utility: best.value.U, openAtEnd: !!open };
      if (!placement.betterSchool || cmp(betterSchool.utility, placement.betterSchool.utility) > 0 ||
        (!cmp(betterSchool.utility, placement.betterSchool.utility) && betterSchool.teamIndex < placement.betterSchool.teamIndex)) placement.betterSchool = betterSchool;
    }
    placement.missedPreferenceGap = placement.betterSchool ? placement.betterSchool.utility - mine : 0;
  }

  // Fresh final enumeration deliberately bypasses pair-feasibility caches.
  // Structural and utility vetoes overlap; they are not a causal partition.
  let residualFeasiblePairs = 0;
  const unplaced = [];
  const inspectBoard = new Set([...remaining.values()].sort((a, b) => b.overall - a.overall || byId(a, b)).slice(0, 10).map(p => p.id));
  for (const p of remaining.values()) if (p.overall >= 85) inspectBoard.add(p.id);
  for (const p of remaining.values()) {
    const vetoCounts = {}, schoolVetoes = [], boardOnlyVetoes = [];
    let bestNet = null, bestUtility = null;
    for (const state of states) {
      const result = evaluate(state, p, { useCache: false });
      if (result.best) residualFeasiblePairs++;
      for (const reason of result.reasons) vetoCounts[reason] = (vetoCounts[reason] ?? 0) + 1;
      schoolVetoes.push({ teamIndex: state.team.index, team: state.team.name, reasons: result.reasons,
        diagnostic: result.diagnostic ? { ...traceOffer(result.diagnostic, state), blockers: result.diagnostic.blockers, diagnosticOnly: true } : null });
      if (result.diagnostic && (!bestNet || variantOrder(result.diagnostic, bestNet) < 0)) bestNet = result.diagnostic;
      if (result.highestUtility && (!bestUtility || offerChoice(result.highestUtility, bestUtility) < 0)) bestUtility = result.highestUtility;
      if (inspectBoard.has(p.id) && freeBoard(state) <= 0) {
        const counterfactual = evaluate(state, p, { ignoreBoard: true, useCache: false });
        if (counterfactual.best) boardOnlyVetoes.push({ ...traceOffer(counterfactual.best, state), counterfactualOnly: true });
      }
    }
    unplaced.push({ ...playerInfo(p), fromTeamIndex: p.prevTeamIndex, traits: traits.get(p.id), outside: traits.get(p.id).outside,
      vetoCounts, schoolVetoes, boardOnlyVetoes,
      bestNet: bestNet ? traceOffer(bestNet, states.find(s => s.team.index === bestNet.teamIndex)) : null,
      bestUtility: bestUtility ? traceOffer(bestUtility, states.find(s => s.team.index === bestUtility.teamIndex)) : null });
  }
  if (residualFeasiblePairs) throw new Error(`Market stopped with ${residualFeasiblePairs} feasible transactions.`);

  const teams = states.map(state => {
    for (const promise of state.promises.values()) {
      const p = promise.p, value = utility(p, state.rooms[p.room], state.slots[p.room], traits.get(p.id), pairFor(p, state));
      promise.placement.final = { ...value, competitors: state.rooms[p.room].filter(x => x.id !== p.id).sort((a, b) => b.q1 - a.q1 || byId(a, b)).map(playerInfo) };
    }
    const native = rosterSnapshot(state.native, state.team, state.slots, state.traits);
    const postWithdrawal = rosterSnapshot(state.initial, state.team, state.slots, state.traits);
    const final = rosterSnapshot(state.roster, state.team, state.slots, state.traits);
    const retainedOpportunity = state.roster.filter(p => !candidateIds.has(p.id) && p.room).map(p => {
      const slots = state.slots[p.room], simple = roster => {
        const room = roster.filter(x => x.room === p.room);
        // Non-market players have no generated utility/promise; report only opportunity.
        return { O1: opportunityFor(p, room, slots, 1), O2: opportunityFor(p, room, slots, 2) };
      };
      return { ...playerInfo(p), kind: p.kind, native: simple(state.native), postWithdrawal: simple(state.initial), final: simple(state.roster) };
    });
    return { teamIndex: state.team.index, team: state.team.name, traits: state.traits, schemeDefaults: state.schemeDefaults,
      excluded: state.excluded, coverage: state.coverage, rosterBefore: state.initial.length, rosterAfter: state.roster.length,
      boardCapacity: state.team.boardCapacity, boardUsed: state.team.boardCapacity - freeBoard(state),
      boardUsedBefore: state.team.boardUsed + input.withdrawals.filter(w => w.teamIndex === state.team.index).length,
      boardUsedAfterWithdrawal: state.team.boardUsed, acquired: state.n, replacements: state.replacements, recruitReleases: state.recruitReleases,
      native, postWithdrawal, final, retainedOpportunity, roster: state.roster.map(p => p.id), nativeToFinalV1: final.V1 - native.V1 };
  });
  const lowOpportunityElite = placements.filter(p => p.E === 1 && p.overall >= 85 && cmp(p.final.O1, 35) < 0);
  const rareLowOpportunityElite = lowOpportunityElite.filter(p => p.lifestyleCounterfactual.decisive);
  const largeGaps = placements.filter(p => cmp(p.missedPreferenceGap, 10) > 0);
  const realMisses = largeGaps.filter(p => p.betterSchool.openAtEnd);
  const familiarSchools = ["Missouri", "Maryland", "Iowa State"].map(name => {
    const matches = teams.filter(t => t.team === name); return { name, teamIndex: matches.length === 1 ? matches[0].teamIndex : null, issue: matches.length === 1 ? null : matches.length ? "ambiguous" : "missing" };
  });
  const withdrawalsById = new Map(input.withdrawals.map(w => [w.id, w]));
  for (const outcome of [...placements, ...unplaced]) {
    const original = withdrawalsById.get(outcome.id);
    outcome.originalCPUCommitment = original?.teamIndex ?? null;
    outcome.cpuCommitmentOutcome = original ? outcome.teamIndex == null ? "unplaced" : outcome.teamIndex === original.teamIndex ? "same school" : "reassigned" : null;
  }
  const diagnostics = { ...input.diagnostics, ignoredKeepLocks: ignoredKeep, obsoleteLocks,
    unknownDevelopment: [...players.values()].filter(p => p.unknownDevelopment).map(p => p.index),
    unknownSchemes: teams.filter(t => t.schemeDefaults.offense || t.schemeDefaults.defense).map(t => ({ teamIndex: t.teamIndex, ...t.schemeDefaults })),
    simulatedRarePlayers: candidates.filter(p => traits.get(p.id).rareLifestyle).map(p => p.index),
    lifestyleAcceptanceEffects: placements.filter(p => p.traits.rareLifestyle && p.lifestyleCounterfactual.ordinaryRejectsAccepted).length,
    lifestyleChoiceEffects: placements.filter(p => p.traits.rareLifestyle && p.lifestyleCounterfactual.ordinaryChoiceChanged).length,
    lowOpportunityElite: lowOpportunityElite.map(p => p.index), rareLowOpportunityElite: rareLowOpportunityElite.map(p => p.index),
    rarityReviewRequired: rareLowOpportunityElite.length >= 2,
    // count/share: a better school could still legally sign him when the market ended.
    // willingBetterSchool also counts better schools that had no capacity left.
    missedPreference: { count: realMisses.length, willingBetterSchool: largeGaps.length, denominator: placements.length,
      share: placements.length ? realMisses.length / placements.length : null,
      willingShare: placements.length ? largeGaps.length / placements.length : null,
      reviewRequired: placements.length > 0 && realMisses.length / placements.length > .10,
      largest: [...largeGaps].sort((a, b) => cmp(b.missedPreferenceGap, a.missedPreferenceGap) || byId(a, b)).slice(0, 10).map(p => ({ index: p.index, name: p.name, gap: p.missedPreferenceGap, accepted: p.teamIndex, betterSchool: p.betterSchool.teamIndex, openAtEnd: p.betterSchool.openAtEnd })) },
    futureHeavySignings: placements.filter(p => p.futureHeavy).map(p => p.index), promiseBlocks,
    largestDeclines: teams.filter(t => cmp(t.nativeToFinalV1, 0) < 0).sort((a, b) => cmp(a.nativeToFinalV1, b.nativeToFinalV1) || a.teamIndex - b.teamIndex).slice(0, 5).map(t => ({ teamIndex: t.teamIndex, team: t.team, change: t.nativeToFinalV1 })),
    largestHBRooms: [...teams].sort((a, b) => b.final.rooms.HB.count - a.final.rooms.HB.count || a.teamIndex - b.teamIndex).slice(0, 10).map(t => ({ teamIndex: t.teamIndex, team: t.team, count: t.final.rooms.HB.count, excess: t.final.rooms.HB.excess })),
    largestWRRooms: [...teams].sort((a, b) => b.final.rooms.WR.count - a.final.rooms.WR.count || a.teamIndex - b.teamIndex).slice(0, 10).map(t => ({ teamIndex: t.teamIndex, team: t.team, count: t.final.rooms.WR.count, excess: t.final.rooms.WR.excess })),
    familiarSchools, residualFeasiblePairs,
    limitation: "Values, opportunity, growth, school philosophies and social/culture preferences are simulated. Native rosters are projections, and the game controls later training, fill and releases." };
  return { model: MODEL, parameters: PARAMETERS, seed, seasonYear: input.seasonYear, userTeamIndex: input.userTeamIndex,
    summary: { candidates: candidates.length, placed: placements.length, unplaced: unplaced.length, withdrawn: input.withdrawals.length, tradeUps, restoredReleases,
      baselineCuts: cuts.filter(c => c.kind === "baseline").length, replacementCuts: cuts.filter(c => c.kind === "replacement").length,
      recruitReleases: cuts.filter(c => c.kind === "recruit").length,
      cuts: cuts.filter(c => c.kind !== "recruit").length, participatingSchools: states.filter(s => !s.excluded).length, excludedSchools: states.filter(s => s.excluded).length,
      rounds: rounds.length, offers: rounds.reduce((n, r) => n + r.offers.length, 0), schoolsOfferingMultiple: new Set(rounds.flatMap(r => {
        const counts = new Map(); for (const o of r.offers) counts.set(o.teamIndex, (counts.get(o.teamIndex) ?? 0) + 1); return [...counts].filter(([, n]) => n > 1).map(([i]) => i);
      })).size },
    placements, unplaced, cuts, withdrawals: input.withdrawals.map(w => ({ ...w })), teams, rounds, diagnostics };
}

// Kept as a separate import alias so retained-roster reporting cannot generate traits.
import { opportunity as opportunityFor } from "./market-model.mjs";
