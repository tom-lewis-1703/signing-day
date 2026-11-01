// Sophomore draft lock on a fresh copy: plan, backup, write, reopen, then a fresh read of the result.
// node tools/draft-lock-test.mjs [save path; default Tom's DYNASTY-PLYRSLEAVING, as the fixtures hold no sophomore draft rows]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Session } from "../lib/session.mjs";
import { Dynasty } from "../lib/dynasty.mjs";
import { loadSettings } from "../lib/settings.mjs";

const source = path.resolve(process.argv[2] ?? path.join(os.homedir(), "Documents", "EA SPORTS College Football 27", "saves", "DYNASTY-PLYRSLEAVING"));
fs.mkdirSync("test_runs", { recursive: true });
const work = fs.mkdtempSync(path.join("test_runs", "draft-lock-"));
const file = path.resolve(work, path.basename(source));
fs.copyFileSync(source, file);
const team = loadSettings().testSavesTeam;
const sourceBytes = fs.readFileSync(source);

const before = await Dynasty.load(file);
const session = new Session();
await session.open(file, { userTeam: team });
const user = session.userTeam.teamIndex;
const plan = session.draftLockPlan();
assert.ok(plan.players.length, "Nothing to lock on this save");
assert.ok(plan.players.every(p => p.teamIndex !== user), "The user team is left out");
const planned = new Set(plan.players.map(p => p.index));
for (const p of before.players) {
  const wanted = p.schoolYear === "Sophomore" && p.team !== user && p.nflRows.some(r => String(r.LeaveStatus) !== "Staying");
  assert.equal(planned.has(p.index), wanted, `${p.name}: plan membership`);
}
await assert.rejects(() => session.saveDraftLock({ planId: "stale" }), /Review the current/);
const saved = await session.saveDraftLock({ planId: plan.id });

const after = await Dynasty.load(file);
const decision = p => JSON.stringify(p.nflRows.map(r => [String(r.LeaveType), String(r.LeaveStatus), Number(r.PersuadeAttempts)]));
let otherLeaving = 0;
for (const p of before.players) {
  const q = after.playerByIndex.get(p.index);
  assert.equal(q.ref, p.ref); assert.equal(q.team, p.team); assert.equal(q.overall, p.overall);
  if (planned.has(p.index)) {
    assert.equal(q.leavingForDraft, false, `${p.name} still leaving`);
    assert.ok(q.nflRows.every(r => String(r.LeaveStatus) === "Staying" && Number(r.PersuadeAttempts) >= 1), `${p.name} rows`);
  } else {
    assert.equal(decision(q), decision(p), `${p.name}: other draft decisions unchanged`);
    if (q.leavingForDraft) otherLeaving++;
  }
}
assert.equal(after.players.filter(p => p.schoolYear === "Sophomore" && p.team !== user && p.leavingForDraft).length, 0);
assert.equal(after.players.length, before.players.length);
assert.ok(sourceBytes.equals(fs.readFileSync(source)), "The source save is unchanged");
const check = new Session();
await check.open(file, { userTeam: team });
assert.equal(check.draftLockPlan().players.length, 0, "A second plan finds nothing");
console.log(JSON.stringify({ work, stage: before.stage.label, locked: plan.players.length, otherStillLeaving: otherLeaving, top: plan.players.slice(0, 5).map(p => `${p.name} ${p.position}${p.overall} ${p.team}, round ${p.projectedRound}`), backup: saved.backup.backupPath }, null, 1));
