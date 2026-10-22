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
        preservesCoverage: state.rooms[p.room].length - 1 >= state.coverage[p.room] };
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
  const evaluate = (state, p, { ignoreBoard = false, useCache = true, avoidRooms = null } = {}) => {
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
    if (!recruitRelease && state.roster.length === 85 && state.replacements >= 3) structural.push("replacement allowance");
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
      const cross = pool.filter(c => c.p.room !== room && c.preservesCoverage && !avoidRooms?.has(c.p.room)).sort((a, b) => cmp(a.loss, b.loss) || byId(a.p, b.p));
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
  // every quote, utility and promise check holds for any subset of acceptances.
  const offerCap = state => freeBoard(state) <= 0
    ? canReleaseRecruit(state) ? PARAMETERS.recruitReleaseLimit - state.recruitReleases : 0
    : Math.min(freeBoard(state), state.roster.length < 85 ? 85 - state.roster.length : 3 - state.replacements);
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
  // Greedy selection is unchanged until p's quote beats the actual pick at some
  // step, so this says whether the school would have offered p this round.
  const wouldOffer = (state, selected, p) => {
    const standalone = evaluate(state, p, { useCache: false }).best;
    if (!standalone) return false;
    for (let k = 0; k < offerCap(state); k++) {
      const quote = quoteAt(state, standalone, k, touchedBy(selected.slice(0, k)));
      if (!quote) return false;
      if (k >= selected.length || priorityOrder(quote, selected[k]) < 0) return true;
    }
    return false;
  };

  const traceOffer = (offer, state) => ({ ...playerInfo(offer.p), teamIndex: state.team.index, team: state.team.name,
    cut: offer.cut ? playerInfo(offer.cut) : null, cutLoss: offer.cutDetail?.loss ?? 0,
    gain: offer.gain, gain1: offer.gain1, gain2: offer.gain2, d: state.traits.d, delta: state.traits.delta,
    n: offer.n, k: offer.k, cost: offer.cost, net: offer.net, priority: offer.priority ?? offer.net + pairFor(offer.p, state).schoolTaste,
    value: offer.value, opportunity: offer.value.O1, utility: offer.value.U, outside: offer.value.outside,
    futureHeavy: offer.futureHeavy,
    comparison: { gain: Q(offer.gain), cost: Q(offer.cost), net: Q(offer.net), priority: Q(offer.priority ?? offer.net + pairFor(offer.p, state).schoolTaste) } });

  const stateByIndex = new Map(states.map(s => [s.team.index, s])), pendingMisses = new Map();
  for (let round = 1; ; round++) {
    const issued = [], standalone = new Map(), selectedBySchool = new Map();
    const roundBlocks = [];
    for (const state of states) {
      if (state.excluded || offerCap(state) <= 0) continue;
      const choices = [];
      for (const p of remaining.values()) {
        const result = evaluate(state, p);
        if (result.best) {
          const offer = result.best; choices.push(offer);
          const previous = standalone.get(p.id);
          if (!previous || offerChoice(offer, previous) < 0) standalone.set(p.id, offer);
        }
        if (result.positiveUpgrade) {
          const v = result.positiveUpgrade;
          roundBlocks.push({ round, ...traceOffer(v, state), blockers: v.blockers });
        }
      }
      const selected = selectOffers(state, choices);
      issued.push(...selected);
      selectedBySchool.set(state.team.index, selected);
    }
    promiseBlocks.push(...roundBlocks);
    // A missed preference is real when the better school would have offered him
    // in a later round had he still been available, including the final empty one.
    for (const [id, miss] of pendingMisses) {
      const selected = selectedBySchool.get(miss.teamIndex);
      if (selected && wouldOffer(stateByIndex.get(miss.teamIndex), selected, miss.p)) {
        miss.placement.realMissRound = round; pendingMisses.delete(id);
      }
    }
    if (!issued.length) break;
    if (round > candidates.length) throw new Error("Market exceeded its strict termination bound.");
    const actual = new Map();
    for (const offer of issued) {
      if (!actual.has(offer.p.id)) actual.set(offer.p.id, []);
      actual.get(offer.p.id).push(offer);
    }
    const accepted = [...actual.values()].map(offers => offers.sort(offerChoice)[0]).sort((a, b) => a.teamIndex - b.teamIndex || byId(a.p, b.p));
    const acceptedBySchool = new Map();
    for (const offer of accepted) {
      if (!acceptedBySchool.has(offer.teamIndex)) acceptedBySchool.set(offer.teamIndex, []);
      acceptedBySchool.get(offer.teamIndex).push(offer);
    }
    // Verify each real full batch before mutating even virtual state.
    const batches = [];
    for (const state of states) {
      const offers = acceptedBySchool.get(state.team.index);
      if (!offers) continue;
      const removed = new Set(offers.filter(o => o.cut).map(o => o.cut.id));
      const veteranCuts = offers.filter(o => o.cut?.kind === "veteran").length, recruitCuts = removed.size - veteranCuts;
      const after = [...state.roster.filter(p => !removed.has(p.id)), ...offers.map(o => o.p)];
      if (after.length > 85 || offers.length - recruitCuts > freeBoard(state)) throw new Error(`${state.team.name}: accepted batch exceeds capacity.`);
      if (state.replacements + veteranCuts > 3) throw new Error(`${state.team.name}: accepted batch exceeds replacement allowance.`);
      if (state.recruitReleases + recruitCuts > PARAMETERS.recruitReleaseLimit) throw new Error(`${state.team.name}: accepted batch exceeds the recruit-release limit.`);
      for (const room of ROOMS) if (after.filter(p => p.room === room).length < state.coverage[room]) throw new Error(`${state.team.name}: accepted batch violates ${room} coverage.`);
      for (const promise of state.promises.values()) {
        const value = utility(promise.p, after.filter(p => p.room === promise.p.room), state.slots[promise.p.room], traits.get(promise.p.id), pairFor(promise.p, state));
        if (promiseFailures(promise, value).length) throw new Error(`${state.team.name}: accepted batch violates ${promise.p.name}'s original promise.`);
      }
      batches.push({ state, offers, after, veteranCuts, recruitCuts });
    }
    const roundRecord = { round, offers: [], accepted: accepted.map(o => ({ id: o.p.id, index: o.p.index, teamIndex: o.teamIndex })), schoolsWithMultipleOffers: [...selectedBySchool.values()].filter(s => s.length > 1).length };
    for (const state of states) for (const offer of selectedBySchool.get(state.team.index) ?? []) roundRecord.offers.push(traceOffer(offer, state));
    for (const { state, offers, after, veteranCuts, recruitCuts } of batches) {
      for (const offer of offers) {
        const p = offer.p, pt = traits.get(p.id), pair = pairFor(p, state);
        const value = utility(p, after.filter(x => x.room === p.room), state.slots[p.room], pt, pair);
        if (cmp(value.U, pt.outside) <= 0 || cmp(value.U, offer.value.U) || cmp(value.O1, offer.value.O1)) throw new Error(`${p.name}: accepted batch differs from his quoted opportunity.`);
        const contract = p.E >= 2 && cmp(value.O1, 35) < 0 ? "developmental reserve" : "immediate opportunity";
        const alternatives = actual.get(p.id).map(o => traceOffer(o, states.find(s => s.team.index === o.teamIndex)));
        const ordinary = actual.get(p.id).map(o => ({ ...o, value: { ...o.value, U: o.value.ordinaryU } })).filter(o => cmp(o.value.U, pt.outside) > 0).sort(offerChoice)[0] ?? null;
        const ordinaryRejectsAccepted = cmp(value.ordinaryU, pt.outside) <= 0;
        const ordinaryChoiceChanged = (ordinary?.teamIndex ?? null) !== state.team.index;
        const bestStandalone = standalone.get(p.id);
        const bestState = states.find(s => s.team.index === bestStandalone.teamIndex);
        const selectedThere = selectedBySchool.get(bestStandalone.teamIndex) ?? [];
        let withheldReason = null;
        if (!selectedThere.some(o => o.p.id === p.id)) {
          withheldReason = selectedThere.some(o => o.p.room === p.room) ? "preferred another target in this room"
            : selectedThere.some(o => o.cut?.room === p.room) ? "another offer's release came from this room"
            : cmp(bestStandalone.net - .5 * selectedThere.length, 0) <= 0 ? "reservation quote made the transaction unacceptable"
            : "reserved capacity for higher-priority rooms";
        }
        const trace = traceOffer({ ...offer, value }, state);
        const placement = { ...trace, fromTeamIndex: p.prevTeamIndex, round, contract, traits: pt, simulatedPair: pair,
          original: value, final: null, actualOffers: alternatives,
          promiseRoster: after.map(x => x.id),
          lifestyleCounterfactual: { applicable: pt.rareLifestyle, ordinaryRejectsAccepted, ordinaryChoiceChanged,
            ordinaryChoice: ordinary?.teamIndex ?? null, decisive: pt.rareLifestyle && (ordinaryRejectsAccepted || ordinaryChoiceChanged),
            alternatives: alternatives.map(o => ({ teamIndex: o.teamIndex, O1: o.value.O1, U: o.value.U, ordinaryU: o.value.ordinaryU, outside: pt.outside })) },
          bestStandalone: { ...traceOffer(bestStandalone, bestState), withheldReason },
          missedPreferenceGap: Math.max(0, bestStandalone.value.U - value.U), realMissRound: null };
        placements.push(placement);
        if (cmp(placement.missedPreferenceGap, 10) > 0) pendingMisses.set(p.id, { p, teamIndex: bestStandalone.teamIndex, placement });
        state.promises.set(p.id, { p, ...value, E: p.E, contract, futureHeavy: offer.futureHeavy, placement });
        if (offer.cut) cuts.push(cutEntry(state, offer.cutDetail, offer.cut.kind === "recruit" ? "recruit" : "replacement",
          { round, forId: p.id, forIndex: p.index, forName: p.name, ...(offer.cut.kind === "recruit" ? { stars: offer.cut.stars, dev: offer.cut.dev } : {}) }));
        remaining.delete(p.id);
      }
      state.n += offers.length; state.replacements += veteranCuts; state.recruitReleases += recruitCuts; state.roster = after; refresh(state);
    }
    rounds.push(roundRecord);
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
  const realMisses = largeGaps.filter(p => p.realMissRound !== null);
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
    // count/share are real misses; willingBetterSchool counts every gap over 10,
    // including schools that filled up with players they ranked higher.
    missedPreference: { count: realMisses.length, willingBetterSchool: largeGaps.length, denominator: placements.length,
      share: placements.length ? realMisses.length / placements.length : null,
      willingShare: placements.length ? largeGaps.length / placements.length : null,
      reviewRequired: placements.length > 0 && realMisses.length / placements.length > .10,
      largest: [...realMisses].sort((a, b) => cmp(b.missedPreferenceGap, a.missedPreferenceGap) || byId(a, b)).slice(0, 10).map(p => ({ index: p.index, name: p.name, gap: p.missedPreferenceGap, accepted: p.teamIndex, betterStandalone: p.bestStandalone.teamIndex, withheldReason: p.bestStandalone.withheldReason, realMissRound: p.realMissRound })) },
    futureHeavySignings: placements.filter(p => p.futureHeavy).map(p => p.index), promiseBlocks,
    largestDeclines: teams.filter(t => cmp(t.nativeToFinalV1, 0) < 0).sort((a, b) => cmp(a.nativeToFinalV1, b.nativeToFinalV1) || a.teamIndex - b.teamIndex).slice(0, 5).map(t => ({ teamIndex: t.teamIndex, team: t.team, change: t.nativeToFinalV1 })),
    largestHBRooms: [...teams].sort((a, b) => b.final.rooms.HB.count - a.final.rooms.HB.count || a.teamIndex - b.teamIndex).slice(0, 10).map(t => ({ teamIndex: t.teamIndex, team: t.team, count: t.final.rooms.HB.count, excess: t.final.rooms.HB.excess })),
    largestWRRooms: [...teams].sort((a, b) => b.final.rooms.WR.count - a.final.rooms.WR.count || a.teamIndex - b.teamIndex).slice(0, 10).map(t => ({ teamIndex: t.teamIndex, team: t.team, count: t.final.rooms.WR.count, excess: t.final.rooms.WR.excess })),
    familiarSchools, residualFeasiblePairs,
    limitation: "Values, opportunity, growth, school philosophies and social/culture preferences are simulated. Native rosters are projections, and the game controls later training, fill and releases." };
  return { model: MODEL, parameters: PARAMETERS, seed, seasonYear: input.seasonYear, userTeamIndex: input.userTeamIndex,
    summary: { candidates: candidates.length, placed: placements.length, unplaced: unplaced.length, withdrawn: input.withdrawals.length,
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
