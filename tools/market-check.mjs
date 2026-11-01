// First working v1.2 result on a fresh disposable fixture copy.
// node tools/market-check.mjs [--save] [--seed sd-v1.2-001]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Session } from "../lib/session.mjs";
import { Dynasty, ZERO } from "../lib/dynasty.mjs";
import { loadSettings } from "../lib/settings.mjs";
import { buildMarketInput } from "../lib/market-input.mjs";
import { emptyState, buildPlan, playerCard } from "../lib/gui-plan.mjs";
import { releasableRecruit, surplusFreshman } from "../lib/market-model.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "test_saves");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fixtureHashes = () => Object.fromEntries(fs.readdirSync(FIXTURES).filter(n => fs.statSync(path.join(FIXTURES, n)).isFile()).map(n => [n, hash(path.join(FIXTURES, n))]));
const beforeHashes = fixtureHashes();
fs.mkdirSync(path.join(ROOT, "test_runs"), { recursive: true });
const work = fs.mkdtempSync(path.join(ROOT, "test_runs", "market-v1.2-"));
const file = path.join(work, "DYNASTY-SIGNINGDAYCOPY");
fs.copyFileSync(path.join(FIXTURES, "DYNASTY-SIGNINGDAYCOPY"), file);
const seedAt = process.argv.indexOf("--seed");
const seed = seedAt < 0 ? "sd-v1.2-001" : process.argv[seedAt + 1];
assert.equal(typeof seed, "string", "--seed requires a string");
const session = new Session();
await session.open(file, { userTeam: loadSettings().testSavesTeam });
const user = session.userTeam.teamIndex, input = buildMarketInput(session.d, user);
const state = emptyState(); state.seed = seed;
const started = Date.now();
const raw = session.signingDayPlan(state, { seed });
const view = buildPlan(session, raw, state);
assert.equal(new Set(raw.placements.map(p => p.id)).size, raw.placements.length, "Duplicate signer");
assert.equal(raw.placements.length + raw.unplaced.length, input.candidates.length, "Entire eligible pool must be accounted for");
assert(raw.placements.every(p => p.teamIndex !== user), "No user-school signings");
assert(raw.cuts.every(p => p.teamIndex !== user), "No user-school releases");
assert(raw.withdrawals.every(p => p.teamIndex !== user), "No user-school withdrawals");
const protectedRecruits = new Set(input.players.filter(p => p.kind === "recruit").map(p => p.id));
const releasedRecruits = raw.cuts.filter(c => c.kind === "recruit"), released = new Set(releasedRecruits.map(c => c.id));
assert(raw.cuts.filter(c => c.kind !== "recruit").every(p => !protectedRecruits.has(p.id)), "Veteran releases never touch HS/JUCO commitments");
assert(releasedRecruits.every(c => protectedRecruits.has(c.id) && (c.reason === "surplus" ? surplusFreshman(input.players.find(p => p.id === c.id)) : releasableRecruit(c))), "Recruit release eligibility and development protection");
const names = ["Nate Sheppard", "Jesse Legree", "Lance Heard", "Jackson Arnold", "Trevor Bindel", "Joenel Figueroa", "Matyus McLain", "David Murphy", "Justin Lawson", "Elijah Murrell"];
const cards = names.map(name => {
  const matches = session.d.players.filter(p => p.name === name);
  return matches.length === 1 ? playerCard(session, raw, state, matches[0].index) : { name, error: `${matches.length} matching identities` };
});
const outcome = index => raw.placements.find(p => p.index === index)?.teamIndex ?? null;
const former = { reassigned: [], sameSchool: [], unplaced: [] };
for (const w of raw.withdrawals) former[outcome(w.index) === null ? "unplaced" : outcome(w.index) === w.teamIndex ? "sameSchool" : "reassigned"].push(w);
const boardRefs = (d, teamIndex) => {
  const row = d.rowAt(d.teams.get(teamIndex).record, "CommittedPlayers").row;
  return Object.keys(row.fields).filter(k => /^Player\d+$/.test(k)).map(k => row[k]).filter(r => r !== ZERO).sort();
};
const originalUserBoard = boardRefs(session.d, user);
const originalUserRoster = session.d.players.filter(p => p.team === user).map(p => p.ref).sort();
const preserved = new Map(input.teams.flatMap(t => t.roster.filter(id => protectedRecruits.has(id)).map(id => [id, t.index])));
const report = { model: raw.model, seed: raw.seed, planId: raw.id, work, file, userTeam: session.userTeam,
  sourceHash: hash(file), inputCounts: input.diagnostics.counts, summary: view.summary, planningMs: Date.now() - started,
  formerlyCommitted: Object.fromEntries(Object.entries(former).map(([k, v]) => [k, { count: v.length, first: v[0] ?? null }])),
  namedPlayers: cards, saved: false };
fs.writeFileSync(path.join(work, "plan.json"), JSON.stringify(raw, null, 2));
fs.writeFileSync(path.join(work, "view.json"), JSON.stringify(view, null, 2));
console.log(JSON.stringify({ work, planningMs: report.planningMs, counts: report.inputCounts, summary: report.summary, formerlyCommitted: report.formerlyCommitted }, null, 2));
for (const c of cards) console.log(`${c.name}: ${c.status ?? c.error}. ${c.why ?? ""}`);
if (process.argv.includes("--save")) {
  const applied = await session.applySigningDay(state, { planId: raw.id });
  assert(applied.ok, applied.failed?.join("\n"));
  const saved = await session.save();
  const reopened = await Dynasty.load(file);
  assert.equal(reopened.players.length, input.players.length, "Player records retained");
  assert.deepEqual(boardRefs(reopened, user), originalUserBoard, "User commitments preserved");
  assert.deepEqual(reopened.players.filter(p => p.team === user).map(p => p.ref).sort(), originalUserRoster, "User roster preserved");
  const byRef = new Map(reopened.players.map(p => [p.ref, p]));
  for (const [id, teamIndex] of preserved) if (!released.has(id)) assert.equal(reopened.boardTeamByPlayerRef.get(id), teamIndex, `Preserved recruit ${id}`);
  for (const c of releasedRecruits) {
    const p = byRef.get(c.id);
    assert.equal(p.recruitStage, "Top10"); assert.equal(Number(p.recruitRecord.TotalScholarshipOffers), 0);
    assert(!reopened.boardTeamByPlayerRef.has(c.id), `Released recruit ${c.name} is off every board`);
  }
  for (const p of raw.placements) {
    assert.equal(byRef.get(p.id).recruitStage, "Signed");
    assert.equal(reopened.boardTeamByPlayerRef.get(p.id), p.teamIndex);
  }
  for (const w of former.unplaced) {
    const p = byRef.get(w.id);
    assert.equal(p.recruitStage, "Top10"); assert.equal(Number(p.recruitRecord.TotalScholarshipOffers), 0);
    assert.equal(p.team, 255); assert.equal(p.destination, null);
    assert.equal(p.prevTeam, input.players.find(x => x.id === w.id).prevTeamIndex);
    assert(!reopened.boardTeamByPlayerRef.has(w.id));
  }
  report.saved = true; report.backupPath = saved.backup.backupPath; report.savedHash = hash(file);
  report.backupHash = hash(saved.backup.backupPath); assert.equal(report.backupHash, report.sourceHash);
  report.saveVerification = saved.check;
  console.log(`Saved and independently reopened ${file}`);
}
const afterHashes = fixtureHashes(); assert.deepEqual(afterHashes, beforeHashes, "All fixtures unchanged");
fs.writeFileSync(path.join(work, "fixture-hashes.json"), JSON.stringify({ before: beforeHashes, after: afterHashes }, null, 2));
fs.writeFileSync(path.join(work, "report.json"), JSON.stringify(report, null, 2));
console.log(`First-result evidence: ${path.join(work, "report.json")}`);
