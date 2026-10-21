// Step 1 test: open, detect stage, back up and save each test save, then check
// the saved file against its backup.
//   node tools/step1-test.mjs <folder with test saves> <new work folder>
// The source folder is only read; every save is first copied into the work folder.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Session, openFranchise } from "../lib/session.mjs";

const [srcDir, workRoot] = process.argv.slice(2);
if (!srcDir || !workRoot) {
  console.error("usage: node tools/step1-test.mjs <test saves folder> <work folder>");
  process.exit(2);
}

const sha1 = f => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
const KEY_TABLES = {
  Player: 1612938518, Team: 3359508968, Recruit: 1873209313,
  TopSchools: 2332540366, TargetSchool: 3843719174, LeavingPlayer: 1418279587
};

async function compareKeyTables(fileA, fileB) {
  const [a, b] = await Promise.all([openFranchise(fileA), openFranchise(fileB)]);
  const unpackedIdentical = Buffer.compare(a.unpackedFileContents, b.unpackedFileContents) === 0;
  const tables = {};
  for (const [name, uid] of Object.entries(KEY_TABLES)) {
    const ta = a.getTableByUniqueId(uid), tb = b.getTableByUniqueId(uid);
    await Promise.all([ta.readRecords(), tb.readRecords()]);
    let records = 0, diffs = 0;
    for (let i = 0; i < ta.records.length; i++) {
      const ra = ta.records[i], rb = tb.records[i];
      if (!ra || ra.isEmpty) continue;
      records++;
      for (const k of Object.keys(ra.fields)) {
        if (String(ra[k]) !== String(rb?.[k])) { diffs++; break; }
      }
    }
    tables[name] = { records, recordsDifferent: diffs };
  }
  return { unpackedIdentical, tables };
}

const sources = fs.readdirSync(srcDir).filter(f => f.startsWith("DYNASTY-")).sort();
const workDir = path.join(workRoot, new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"));
fs.mkdirSync(workDir, { recursive: true });
console.log(`Work folder: ${workDir}\n`);

const summary = [];
for (const name of sources) {
  const src = path.join(srcDir, name);
  const srcHashBefore = sha1(src);
  const work = path.join(workDir, name);
  fs.copyFileSync(src, work, fs.constants.COPYFILE_EXCL);

  const session = new Session();
  const info = await session.open(work);
  const saved = await session.save();
  const backupMatchesCopy = sha1(saved.backup.backupPath) === srcHashBefore;
  const savedBytesIdentical = sha1(work) === srcHashBefore;
  const cmp = await compareKeyTables(saved.backup.backupPath, work);
  const sourceUntouched = sha1(src) === srcHashBefore;

  const c = info.counts;
  console.log(`== ${name}`);
  console.log(`  Stage: ${info.stage.label}  (CurrentOffseasonStage=${info.stage.raw.CurrentOffseasonStage}, season ${info.stage.seasonYear}, opened in ${info.openMs} ms)`);
  console.log(`  Your team: ${info.userTeam ? `${info.userTeam.name} #${info.userTeam.teamIndex}, ${c.userTeamRoster} on roster` : "NOT FOUND"}`);
  console.log(`  Rostered ${c.rostered} | early draft ${c.earlyDraft} | entering portal ${c.enteringPortal} | transfers uncommitted ${c.portalUncommitted} | committed ${c.portalCommitted}`);
  console.log(`  Save: ${saved.saveMs} ms, verified "${saved.check.stage}" / ${saved.check.playerCount} players`);
  console.log(`  Backup: ${path.relative(workDir, saved.backup.backupPath)} (${saved.backup.bytes} bytes, matches pre-save file: ${backupMatchesCopy})`);
  console.log(`  Saved file byte-identical to original: ${savedBytesIdentical}; game data identical: ${cmp.unpackedIdentical}`);
  console.log(`  Key tables: ${Object.entries(cmp.tables).map(([k, v]) => `${k} ${v.records} rec/${v.recordsDifferent} diff`).join(", ")}`);
  console.log(`  test_copies source untouched: ${sourceUntouched}\n`);

  summary.push({ name, stage: info.stage.label, ok: backupMatchesCopy && cmp.unpackedIdentical && sourceUntouched && Object.values(cmp.tables).every(t => t.recordsDifferent === 0) });
}

console.log("Summary:");
for (const s of summary) console.log(`  ${s.ok ? "PASS" : "FAIL"}  ${s.name.padEnd(32)} ${s.stage}`);
process.exit(summary.every(s => s.ok) ? 0 : 1);
