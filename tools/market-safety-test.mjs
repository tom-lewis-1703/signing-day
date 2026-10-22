// Focused save-boundary checks. Every in-memory mutation uses a fresh disposable
// copy; no source fixture or real save is edited or saved.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { Session } from "../lib/session.mjs";
import { buildMarketInput } from "../lib/market-input.mjs";
import { assertWritableSave } from "../lib/safe-save.mjs";
import { loadSettings } from "../lib/settings.mjs";

const hash = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const fixture = path.resolve("test_saves/DYNASTY-SIGNINGDAYCOPY");
const fixtureHash = hash(fixture);
fs.mkdirSync("test_runs", { recursive: true });
const work = fs.mkdtempSync(path.resolve("test_runs/market-safety-"));
const copy = path.join(work, "DYNASTY-MARKET-SAFETY");
fs.copyFileSync(fixture, copy);
const session = new Session();
const results = [];
const pass = name => { results.push(name); console.log(`PASS ${name}`); };

for (const userTeam of [undefined, null, "", false, NaN, -1]) {
  await assert.rejects(() => session.open(copy, { userTeam }));
}
pass("missing/invalid team cannot use the fixture-team default");
assert.throws(() => assertWritableSave(fixture), /test_saves/);
if (process.platform === "win32") assert.throws(() => assertWritableSave(fixture.replace("test_saves", "TEST_SAVES")), /test_saves/);
pass("fixture write guard rejects original and Windows alternate casing");
await session.open(copy, { userTeam: loadSettings().testSavesTeam });
const d = session.d, input = buildMarketInput(d, session.userTeam.teamIndex);
const a = input.withdrawals[0], b = input.withdrawals.find(x => x.teamIndex !== a.teamIndex);
const pa = d.playerByIndex.get(a.index), pb = d.playerByIndex.get(b.index);
const teamA = d.teams.get(a.teamIndex), teamB = d.teams.get(b.teamIndex);
const boardRef = teamB.record.CommittedPlayers;
teamB.record.CommittedPlayers = teamA.record.CommittedPlayers;
assert.throws(() => buildMarketInput(d, session.userTeam.teamIndex), /alias CommittedPlayers/);
teamB.record.CommittedPlayers = boardRef;
pass("shared commitment-board storage blocks planning");
const topRef = pb.recruitRecord.TopSchoolsList;
pb.recruitRecord.TopSchoolsList = pa.recruitRecord.TopSchoolsList;
assert.throws(() => buildMarketInput(d, session.userTeam.teamIndex), /shared by distinct players/);
pb.recruitRecord.TopSchoolsList = topRef;
pass("shared mutable prospect lists/targets block planning");
const board = d.rowAt(teamA.record, "CommittedPlayers");
const key = Object.keys(board.row.fields).find(k => board.row[k] !== pa.ref && /^Player\d+$/.test(k));
const entry = board.row[key];
board.row[key] = pa.ref;
assert.throws(() => buildMarketInput(d, session.userTeam.teamIndex), /duplicate commitment ownership/);
board.row[key] = entry;
pass("duplicate commitment ownership blocks planning");
assert.deepEqual(buildMarketInput(d, session.userTeam.teamIndex), input);

const locks = { keep: new Set(), notAt: new Map() };
const plan = session.signingDayPlan(locks, { seed: "sd-v1.2-001" });
assert.equal(session.signingDayPlan(locks), plan);
await assert.rejects(() => session.applySigningDay(locks, { planId: "stale-plan" }), /exact currently reviewed plan/);
assert.equal(session.rosterEdits, null);
await assert.rejects(() => session.applySigningDay({ keep: new Set([a.index]), notAt: new Map() }, { planId: plan.id }), /constraints changed/);
assert.equal(session.rosterEdits, null);
pass("stale plan ID and changed constraints reject before mutation");
const originalBytes = fs.readFileSync(copy);
try {
  fs.appendFileSync(copy, Buffer.from([0]));
  await assert.rejects(() => session.applySigningDay(locks, { planId: plan.id }), /source save changed/);
  assert.equal(session.rosterEdits, null);
} finally { fs.writeFileSync(copy, originalBytes); }
pass("changed source bytes reject before mutation");

// Inject a failure after at least one real withdrawal. The source copy must
// remain untouched and the session must reopen with all commitments restored.
const edits = session.edits(), withdraw = edits.withdrawTransfer.bind(edits);
let calls = 0;
edits.withdrawTransfer = (...args) => {
  if (++calls === 2) throw new Error("Deliberate withdrawal failure for rollback check");
  return withdraw(...args);
};
const failed = await session.applySigningDay(locks, { planId: plan.id });
assert.equal(failed.ok, false);
assert.equal(calls, 2);
assert.match(failed.failed.join(" "), /Deliberate withdrawal failure/);
assert.equal(session.rosterEdits, null);
assert.equal(session.appliedPlan, null);
assert.equal(session.reviewedPlan, null);
assert.equal(hash(copy), fixtureHash);
assert.deepEqual(buildMarketInput(session.d, session.userTeam.teamIndex), input);
await assert.rejects(() => session.save(), /Apply the exact reviewed/);
pass("failure after withdrawal rolls back entire session and cannot be saved");
assert.equal(hash(fixture), fixtureHash);
pass("source fixture remains byte-identical");
fs.writeFileSync(path.join(work, "result.json"), JSON.stringify({ fixtureHash, copyHash: hash(copy), planId: plan.id, counts: input.diagnostics.counts, tests: results }, null, 2) + "\n");
console.log(`Safety evidence: ${work}`);
