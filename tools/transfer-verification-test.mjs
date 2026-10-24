// Exact transfer-write verification against real records. Only disposable copies
// and staged files in test_runs/ are written; no market or writer formula changes.
// node tools/transfer-verification-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Session, openFranchise } from "../lib/session.mjs";
import { loadSettings } from "../lib/settings.mjs";
import { safeSave } from "../lib/safe-save.mjs";

const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fixture = path.resolve("test_saves/DYNASTY-SIGNINGDAYCOPY"), sourceHash = hash(fixture);
fs.mkdirSync("test_runs", { recursive: true });
const work = fs.mkdtempSync(path.resolve("test_runs/transfer-verification-"));
const copy = path.join(work, path.basename(fixture));
fs.copyFileSync(fixture, copy, fs.constants.COPYFILE_EXCL);
const report = { work, sourceHash, checks: [] };

try {
  const session = new Session();
  await session.open(copy, { userTeam: loadSettings().testSavesTeam });
  const player = session.d.players.find(p => p.name === "Noah Aaronson");
  assert(player && player.team !== session.userTeam.teamIndex, "Named cut must be a CPU player");
  session.edits().cutPlayer(player);
  const playerTable = session.d.tables.player;
  const logged = session.rosterEdits.writes.get(`${playerTable.header.tableId}:${player.index}`);
  assert.deepEqual(logged.fields, { TeamIndex: 255, PrevTeamIndex: 133 });
  report.player = { index: player.index, name: player.name, overall: player.overall, logged: logged.fields };

  const check = async (name, rejected, corrupt = () => {}) => {
    const staged = path.join(work, `DYNASTY-${name}`);
    await session.d.franchise.save(staged);
    const reopened = await openFranchise(staged);
    corrupt(reopened);
    const problems = await session.verifyEdits(reopened, copy);
    report.checks.push({ name, problems });
    if (rejected) assert(problems.length > 0, `${name}: unlogged change must be rejected`);
    else assert.deepEqual(problems, [], `${name}: legitimate logged edits must pass`);
  };
  await check("logged-cut", false);

  const overall = Number(player.record.OverallRating);
  player.record.OverallRating = overall - 1;
  await check("same-record-ovr", true);
  player.record.OverallRating = overall;

  const other = session.d.players.find(p => !session.rosterEdits.writes.has(`${playerTable.header.tableId}:${p.index}`));
  const otherOverall = Number(other.record.OverallRating);
  other.record.OverallRating = otherOverall === 99 ? 98 : otherOverall + 1;
  await check("other-record-ovr", true);
  other.record.OverallRating = otherOverall;
  await check("restored-logged-cut", false);

  // A list's used length is stored outside the record bytes. It must match the
  // expected packed removal, rather than merely belong to a changed array row.
  const arrayWrite = [...session.rosterEdits.writes.values()].find(w => session.d.tableById.get(w.tableId).isArray);
  assert(arrayWrite, "Cut must exercise packed-array metadata");
  const array = session.d.tableById.get(arrayWrite.tableId), size = array.arraySizes[arrayWrite.row];
  await check("unlogged-array-size", true, reopened => {
    const table = reopened.tables.find(t => t.header.tableId === arrayWrite.tableId);
    table.data.writeUInt32BE(size + 1, table.header.headerSize + arrayWrite.row * 4);
  });
  await check("restored-array-size", false);

  player.record.OverallRating = overall - 1;
  let rejectedCheck;
  await assert.rejects(() => safeSave(session.d.franchise, copy, async (staged, backup) => {
    report.rejectedBackup = backup.backupPath;
    rejectedCheck = await session.verifySaved(staged, backup);
    return rejectedCheck;
  }), /beyond the logged transfer edits/);
  assert.equal(rejectedCheck.ok, false);
  assert.equal(hash(copy), sourceHash, "Rejected verification must not replace the source copy");
  assert.equal(hash(report.rejectedBackup), sourceHash, "Rejected save still has an exact backup");
  assert(!fs.existsSync(report.rejectedBackup.replace(/\.bak$/, ".saving.tmp")), "Rejected staged file must be removed");
  report.checks.push({ name: "save-rejects-same-record-ovr", problems: rejectedCheck.problems });
  player.record.OverallRating = overall;
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack;
  throw error;
} finally {
  report.fixtureUnchanged = hash(fixture) === sourceHash;
  report.copyUnchanged = hash(copy) === sourceHash;
  fs.writeFileSync(path.join(work, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Transfer verification evidence: ${path.join(work, "report.json")}`);
  assert(report.fixtureUnchanged && report.copyUnchanged, "Source fixture and original copy must remain unchanged");
}
console.log(`Transfer verification passed: ${report.checks.length} checks for ${report.player.name}.`);
