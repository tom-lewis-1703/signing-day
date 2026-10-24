// Focused tests of the actual GUI save route with isolated dependencies.
// No server or save access; only the test report is written in test_runs/.
// node tools/save-cleanup-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// Keep production startup unchanged: load the route and its real closeSave
// function without starting a server. Fail explicitly if these boundaries move.
const source = fs.readFileSync("gui.mjs", "utf8");
const start = source.indexOf("const api = {"), end = source.indexOf("\n};", start);
const close = source.match(/^function closeSave\(\).*$/m)?.[0];
const requirePlan = source.match(/^function requirePlan\(\).*$/m)?.[0];
assert(start >= 0 && end > start && close && requirePlan, "GUI route boundaries changed; update the test harness");

function route({ cleanupFails = false, saveFails = false } = {}) {
  const events = [], warnings = [];
  const session = {
    d: { filePath: "memory-save" }, userTeam: { teamIndex: 37 },
    applySigningDay: async () => { events.push("apply"); return { ok: true }; },
    save: async () => {
      events.push("save");
      if (saveFails) throw new Error("Staged save failed verification");
      return { backup: { backupPath: "memory-backup" } };
    },
    open: async (file, options) => {
      assert.equal(file, "memory-save"); assert.equal(options.userTeam, 37);
      events.push("reopen");
    }
  };
  const code = `let opened = {}, session = mockSession, state = {keep:new Set(),notAt:new Map()},
    raw = {id:'reviewed'}, changes = {}, activeTool = 'transfers';
    ${close}
    ${requirePlan}
    ${source.slice(start, end + 3)}
    ({save:api['POST /api/save'],snapshot:()=>({opened,session,state,raw,changes,activeTool})});`;
  const handlers = vm.runInNewContext(code, {
    mockSession: session,
    HttpError: class extends Error {},
    plan: () => ({ summary: { placed: 1 } }), lockCount: () => 2,
    locksPath: file => `${file}.locks.json`, rebuild: () => events.push("rebuild"),
    console: { warn: message => warnings.push(message) },
    fs: { rmSync: (file, options) => {
      assert.equal(file, "memory-save.locks.json"); assert.equal(options.force, true);
      events.push("remove-sidecar");
      if (cleanupFails) throw Object.assign(new Error("Sidecar is locked"), { code: "EPERM" });
    } }
  });
  return { ...handlers, session, events, warnings };
}

const checks = [];
for (const cleanupFails of [false, true]) {
  const test = route({ cleanupFails });
  try {
    const result = await test.save({ planId: "reviewed" });
    assert.equal(result.ok, true);
    assert.equal(result.backupPath, "memory-backup");
    assert.equal(result.counts.placed, 1); assert.equal(result.undos, 2);
    assert(Object.values(test.snapshot()).every(value => value === null), "Every session state must be cleared");
    assert.deepEqual(test.events, ["apply", "save", "remove-sidecar"]);
    assert.equal(test.warnings.length, cleanupFails ? 1 : 0);
    checks.push({ name: cleanupFails ? "successful-save-with-cleanup-failure" : "normal-success", passed: true });
  } catch (error) {
    checks.push({ name: cleanupFails ? "successful-save-with-cleanup-failure" : "normal-success", passed: false,
      error: error.message, events: test.events, sessionClosed: test.snapshot().session === null });
  }
}
const failed = route({ saveFails: true, cleanupFails: true });
const result = await failed.save({ planId: "reviewed" });
assert.equal(result.ok, false);
assert.deepEqual(Array.from(result.failed), ["Staged save failed verification"]);
assert.equal(result.backupPath, undefined);
assert.deepEqual(failed.events, ["apply", "save", "reopen", "rebuild"]);
assert.equal(failed.snapshot().session, failed.session, "Failed saves must retain the reopened session for review");
assert.equal(failed.warnings.length, 0);
checks.push({ name: "genuine-save-failure", passed: true });

fs.mkdirSync("test_runs", { recursive: true });
const work = fs.mkdtempSync(path.resolve("test_runs/save-cleanup-test-"));
const report = { passed: checks.every(check => check.passed), checks };
fs.writeFileSync(path.join(work, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, report: path.join(work, "report.json") }, null, 2));
if (!report.passed) process.exitCode = 1;
