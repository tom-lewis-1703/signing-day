// Signing Day GUI: the Plan the screens show, built from
// session.signingDayPlan(locks), and the undo locks + review states kept beside the save.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKUP_DIR_NAME } from "./safe-save.mjs";

export const SAVES_DIR = path.join(os.homedir(), "Documents", "EA SPORTS College Football 27", "saves");

// Persist only Tom's constraints and explicit seed; a review marker binds the full plan.
export const locksPath = savePath => `${savePath}.locks.json`;
export const emptyState = () => ({ keep: new Set(), notAt: new Map(), reviewed: new Map(), seed: undefined });
export function loadState(savePath) {
  const state = emptyState();
  if (!fs.existsSync(locksPath(savePath))) return state;
  const data = JSON.parse(fs.readFileSync(locksPath(savePath), "utf8"));
  state.keep = new Set((data.keep ?? []).map(Number));
  state.notAt = new Map(Object.entries(data.notAt ?? {}).map(([i, schools]) => [Number(i), new Set(schools.map(Number))]));
  state.reviewed = new Map(Object.entries(data.reviewed ?? {}).map(([i, review]) => [Number(i), String(review)]));
  state.seed = typeof data.seed === "string" && data.seed.trim() ? data.seed : undefined;
  return state;
}
export function saveState(savePath, state) {
  fs.writeFileSync(locksPath(savePath), JSON.stringify({ seed: state.seed, keep: [...state.keep],
    notAt: Object.fromEntries([...state.notAt].map(([i, teams]) => [i, [...teams]])), reviewed: Object.fromEntries(state.reviewed) }, null, 2) + "\n");
}
export const lockCount = state => state.keep.size + [...state.notAt.values()].reduce((n, teams) => n + teams.size, 0);
export const rawPlan = (session, state) => session.signingDayPlan(state, { seed: state.seed });
export const movesOf = team => JSON.stringify([team.reviewIdentity, team.in.map(p => p.playerIndex), team.out.map(p => p.playerIndex)]);

const teamInfo = team => team ? ({ index: team.index, name: team.name, short: team.short, colors: team.colors, ...teamArt(team.name, team.record.LongName) }) : null;
const playerRow = p => ({ playerIndex: p.index, name: p.name, pos: p.position, ovr: p.overall });
const num = value => Number.isFinite(value) ? value.toFixed(1) : "—";
const reasonsFor = outcome => Object.entries(outcome.vetoCounts ?? {}).sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${reason}: ${count} schools`).join("; ");

export function buildPlan(session, raw, state) {
  const d = session.d, landed = new Map(raw.placements.map(p => [p.index, p]));
  const teams = raw.teams.map(t => ({ ...teamInfo(d.teams.get(t.teamIndex)), reviewIdentity: raw.id,
    rosterBefore: t.native.headcount, rosterAfterWithdrawal: t.postWithdrawal.headcount, rosterAfter: t.rosterAfter,
    boardCapacity: t.boardCapacity, boardUsed: t.boardUsed, boardUsedBefore: t.boardUsedBefore, boardUsedAfterWithdrawal: t.boardUsedAfterWithdrawal,
    excluded: t.excluded, in: [], out: [], kept: [], status: "", rooms: t.final.rooms,
    values: { native: t.native.V1, postWithdrawal: t.postWithdrawal.V1, final: t.final.V1 },
    snapshots: { native: t.native, postWithdrawal: t.postWithdrawal, final: t.final }, retainedOpportunity: t.retainedOpportunity, schoolSimulation: t.traits }));
  const byTeam = new Map(teams.map(t => [t.index, t]));
  for (const p of raw.placements) byTeam.get(p.teamIndex)?.in.push({ ...playerRow(p), from: d.teamName(p.fromTeamIndex),
    kind: "placed", role: p.contract, opportunity: p.final.O1, utility: p.original.U, net: p.net });
  for (const p of raw.cuts) byTeam.get(p.teamIndex)?.out.push({ ...playerRow(p), kind: "release", cutKind: p.kind,
    reason: p.kind === "baseline" ? "Release to reach 85 while preserving room coverage" : `Contingent release for ${p.forName}`,
    result: "Released", marginalLoss: p.marginalLoss });
  for (const w of raw.withdrawals) {
    const p = d.playerByIndex.get(w.index), destination = landed.get(w.index);
    byTeam.get(w.teamIndex)?.out.push({ ...playerRow(p), kind: "withdrawal", result: destination ? "Reallocated" : "Unplaced",
      to: destination ? d.teamName(destination.teamIndex) : null,
      reason: destination?.teamIndex === w.teamIndex ? "Reopened; independently signed here again" : destination ? `Reopened; signed with ${d.teamName(destination.teamIndex)}` : "Reopened; no mutually acceptable offer remained" });
  }
  for (const index of state.keep) {
    const p = d.playerByIndex.get(index);
    if (p && !raw.withdrawals.some(w => w.index === index)) byTeam.get(p.team)?.kept.push({ ...playerRow(p), lock: "keep", now: "Retained", undone: "Release" });
  }
  for (const [index, schools] of state.notAt) {
    const p = d.playerByIndex.get(index);
    if (p) for (const team of schools) byTeam.get(team)?.kept.push({ ...playerRow(p), lock: "notAt", now: landed.has(index) ? `Placed at ${d.teamName(landed.get(index).teamIndex)}` : "Unplaced", undone: "Transfer in" });
  }
  for (const t of teams) {
    const order = (a, b) => b.ovr - a.ovr || a.playerIndex - b.playerIndex;
    t.in.sort(order); t.out.sort(order); t.kept.sort(order);
    const review = state.reviewed.get(t.index);
    t.status = review === undefined ? t.in.length || t.out.length ? "CHANGED" : "" : review === movesOf(t) ? "REVIEWED" : "RE-CHECK";
    t.counts = { in: t.in.length, out: t.out.length, kept: t.kept.length };
  }
  const warnings = ["Player priorities and school social/culture traits are simulated. Opportunity is an index, not guaranteed playing time.",
    "Withdrawing a CPU commitment can remove its Signed-at-Training-Results growth eligibility. Later game fill and training remain outside this plan."];
  if (raw.summary.excludedSchools) warnings.push(`${raw.summary.excludedSchools} schools cannot reach 85 under the protections and are excluded.`);
  if (raw.diagnostics.missedPreference.reviewRequired) warnings.push(`Competition review: ${raw.diagnostics.missedPreference.count}/${raw.placements.length} signers took an offer over 10 utility points worse than a school that would have offered him in a later round.`);
  if (raw.diagnostics.rarityReviewRequired) warnings.push("Review required: multiple elite final-year signers have low final opportunity and a decisive rare simulated priority.");
  if (raw.diagnostics.ownershipDiscrepancies?.length) warnings.push(`${raw.diagnostics.ownershipDiscrepancies.length} Top Schools disagreements resolved using actual commitment-board ownership.`);
  if (raw.diagnostics.ignoredKeepLocks?.length) warnings.push(`${raw.diagnostics.ignoredKeepLocks.length} keep constraints on transfer candidates are ignored; CPU commitments cannot be exempted.`);
  if (raw.diagnostics.obsoleteLocks?.length) warnings.push(`${raw.diagnostics.obsoleteLocks.length} constraints reference missing players and have no effect.`);
  return { id: raw.id, model: raw.model, seed: raw.seed, save: { fileName: path.basename(d.filePath), filePath: d.filePath, stage: d.stage.label },
    summary: { ...raw.summary, excludedTeams: raw.summary.excludedSchools }, inputCounts: raw.inputCounts,
    userTeam: teamInfo(d.teams.get(session.userTeam.teamIndex)), teams: teams.sort((a, b) => a.name.localeCompare(b.name)),
    unplaced: raw.unplaced.map(p => ({ ...playerRow(p), from: d.teamName(p.fromTeamIndex), reason: reasonsFor(p) })),
    warnings, diagnostics: { ...raw.diagnostics, promiseBlocks: raw.diagnostics.promiseBlocks.slice(0, 20) }, locks: { count: lockCount(state) } };
}

export function playerCard(session, raw, state, playerIndex) {
  const d = session.d, p = d.playerByIndex.get(Number(playerIndex));
  if (!p) return null;
  const placement = raw.placements.find(x => x.index === p.index), unplaced = raw.unplaced.find(x => x.index === p.index);
  const cut = raw.cuts.find(x => x.index === p.index), withdrawal = raw.withdrawals.find(x => x.index === p.index);
  const retainedTeam = raw.teams.find(t => t.roster.includes(p.ref));
  const retained = retainedTeam?.retainedOpportunity.find(x => x.index === p.index);
  const destination = placement?.teamIndex ?? (cut || unplaced ? null : d.boardTeamByPlayerRef.get(p.ref) ?? p.team);
  const status = placement ? "PLACED" : unplaced ? "UNPLACED" : cut ? "RELEASED" : "PRESERVED";
  let why = placement ? `${placement.team} offered in round ${placement.round}: school net ${num(placement.net)}, his utility ${num(placement.original.U)} above outside option ${num(placement.original.outside)}. He chose it from ${placement.actualOffers.length} actual offer${placement.actualOffers.length === 1 ? "" : "s"}.`
    : unplaced ? `No mutually acceptable feasible transaction remained. ${reasonsFor(unplaced)}.`
    : cut ? cut.kind === "baseline" ? "Released to bring the projected roster to 85 while preserving coverage and protected commitments." : `Released only after ${cut.forName} accepted the replacement offer.`
    : "Preserved on his existing roster or commitment board.";
  if (placement?.lifestyleCounterfactual.decisive) why += " His exceptional simulated social/dating priority changed his willingness or choice among actual offers.";
  if (placement && placement.missedPreferenceGap > 10) why += placement.realMissRound !== null
    ? ` A more appealing school did not offer that round (${placement.bestStandalone.withheldReason}) but would have offered him in round ${placement.realMissRound}; this was not an actual offer he rejected.`
    : ` A more appealing school was willing but did not offer (${placement.bestStandalone.withheldReason}) and later used its capacity on players it ranked higher.`;
  const opportunity = placement ? { initial: placement.original.O1, final: placement.final.O1, futureInitial: placement.original.F, futureFinal: placement.final.F }
    : retained ? { initial: retained.native.O1, final: retained.final.O1, futureInitial: retained.native.O2, futureFinal: retained.final.O2 } : null;
  const undos = [];
  if (state.keep.has(p.index)) undos.push({ undone: "release", at: d.teamName(p.team) });
  for (const t of state.notAt.get(p.index) ?? []) undos.push({ undone: "transfer in", at: d.teamName(t) });
  return { index: p.index, name: p.name, pos: p.position, ovr: p.overall, year: p.schoolYear, dev: p.dev.replace("College_", ""),
    portrait: playerPortrait(p.head), initials: [p.record.FirstName, p.record.LastName].map(x => String(x ?? "")[0] ?? "").join(""),
    status, from: teamInfo(d.teams.get(placement || unplaced ? p.prevTeam : cut?.teamIndex ?? withdrawal?.teamIndex ?? p.team)),
    to: teamInfo(d.teams.get(destination)), why, opportunity, contract: placement?.contract ?? null,
    decision: placement ? { utility: placement.original.U, outside: placement.original.outside, net: placement.net, cost: placement.cost,
      gain: placement.gain, gain1: placement.gain1, gain2: placement.gain2, n: placement.n, k: placement.k, round: placement.round,
      priority: placement.priority, d: placement.d, delta: placement.delta, cut: placement.cut, cutLoss: placement.cutLoss,
      features: placement.original.features, finalUtility: placement.final.U, contributions: placement.original.contributions,
      bestStandalone: placement.bestStandalone, missedPreferenceGap: placement.missedPreferenceGap } : null,
    alternatives: placement?.actualOffers.map(a => ({ team: a.team, teamIndex: a.teamIndex, utility: a.utility, opportunity: a.opportunity, accepted: a.teamIndex === placement.teamIndex })) ?? [],
    simulation: placement ? { player: placement.traits, pair: placement.simulatedPair, school: retainedTeam?.traits,
      lifestyleCounterfactual: placement.lifestyleCounterfactual } : unplaced ? { player: unplaced.traits } : {},
    facts: { currentOverall: p.overall, currentYear: p.schoolYear, redshirt: p.redshirt, development: p.dev,
      homeState: p.homeState, gameMotivation: p.dealbreaker, previousSchool: d.teamName(p.prevTeam),
      originalCPUCommitment: withdrawal ? d.teamName(withdrawal.teamIndex) : null },
    forecast: placement || unplaced ? { q1: (placement ?? unplaced).q1, q2: (placement ?? unplaced).q2, seasonsRemaining: (placement ?? unplaced).E } : null,
    release: cut ? { kind: cut.kind, marginalLoss: cut.marginalLoss, loss1: cut.loss1, loss2: cut.loss2,
      coverageFloor: cut.coverageFloor, roomCountBefore: cut.roomCountBefore, forName: cut.forName ?? null } : null,
    competitors: placement?.final.competitors ?? [], vetoes: unplaced?.vetoCounts ?? null,
    boardOnlyVetoes: unplaced?.boardOnlyVetoes ?? [], undos };
}

// The start screen's saves list: dynasty saves only (the game names them DYNASTY-…; profile and
// playbook files sit in the same folder), newest first, without backups or the GUI's lock files.
export function listSaves(dir = SAVES_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name !== BACKUP_DIR_NAME && /^DYNASTY-/i.test(e.name) && !/\.(bak|tmp|json)$/i.test(e.name))
    .map(e => { const p = path.join(dir, e.name); return { name: e.name, path: p, modified: fs.statSync(p).mtime.toISOString() }; })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

// Team logos, helmets and player portraits, served at assets/… by gui.mjs: first the slim copies
// committed in gui/art/ (tools/copy-art.mjs), then Tom's DynastyOS asset library. Both use the
// library's relative paths. Neither there: the screens fall back to monogram tiles.
export const ART_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "gui", "art");
export const ASSETS_DIR = path.join(os.homedir(), "Documents", "DynastyOS Assets");
export const ART_DIRS = [ART_DIR, ASSETS_DIR];
const ART_ALIAS = { california: "cal", uconn: "connecticut", eastcarolina: "ecu", middletennessee: "midtennstate", samhouston: "samhoustonstate", massachusetts: "umass" };
const artKey = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
let artIndex = null;
export function teamArt(name, longName, dirs = ART_DIRS) {
  if (artIndex?.dirs !== dirs) {
    // Later entries win, so gui/art/ goes last.
    const pack = (sub, strip) => new Map([...dirs].reverse().flatMap(dir => {
      const p = path.join(dir, sub);
      return fs.existsSync(p) ? fs.readdirSync(p).map(f => [artKey(f.replace(strip, "")), `assets/${sub}/${f}`]) : [];
    }));
    artIndex = { dirs, logo: pack("logos-flat-dark", /^tlow_|\.webp$/g), helmet: pack("helmet/left", /^thel_lthelmets_|_result\.webp$/g) };
  }
  const keys = [artKey(longName), artKey(name)].flatMap(k => [k, ART_ALIAS[k]]).filter(Boolean);
  const find = m => keys.map(k => m.get(k)).find(Boolean) ?? null;
  return { logo: find(artIndex.logo), helmet: find(artIndex.helmet) };
}

// Portrait file of a head asset (Player.GenericHeadAssetName): nilpp_<head>.webp. A long name is
// cut to 17 characters plus "-", and the file drops that "-" before the final _<number>.
// null for a name the save shouldn't hold.
export const portraitFile = head => /^[A-Za-z0-9_-]{1,32}$/.test(head || "") ? `nilpp_${head.replace(/-(?=_\d+$)/, "")}.webp` : null;

// His portrait, cached per head: the committed copy in gui/art/, else the DynastyOS library's file
// when the library is on this PC and its name list (gui/art/playerportrait-files.txt) has it, else
// the blank portrait; null only when even that is missing (the card shows his initials).
const PORTRAITS = "playerportrait", BLANK = "nilpp_Blank.webp";
let portraits = null;
export function playerPortrait(head) {
  if (!portraits) {
    const list = path.join(ART_DIR, `${PORTRAITS}-files.txt`);
    portraits = { names: new Set(fs.existsSync(list) ? fs.readFileSync(list, "utf8").split(/\r?\n/).filter(Boolean) : []),
      library: fs.existsSync(path.join(ASSETS_DIR, PORTRAITS)), byHead: new Map() };
  }
  if (!portraits.byHead.has(head)) {
    const file = portraitFile(head), committed = f => fs.existsSync(path.join(ART_DIR, PORTRAITS, f));
    const at = f => `assets/${PORTRAITS}/${f}`;
    portraits.byHead.set(head, file && (committed(file) || (portraits.library && portraits.names.has(file))) ? { src: at(file), blank: false }
      : committed(BLANK) ? { src: at(BLANK), blank: true } : null);
  }
  return portraits.byHead.get(head);
}


