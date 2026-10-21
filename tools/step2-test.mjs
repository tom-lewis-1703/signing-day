// Step 2 test: Draft Lock on a fresh copy of the Players Leaving save.
//   node tools/step2-test.mjs <Players Leaving save> <work folder> [other saves for the readout...]
// The source save is only read; the lock runs on a copy in a new work folder.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Session, openFranchise } from "../lib/session.mjs";

const [src, workRoot, ...others] = process.argv.slice(2);
if (!src || !workRoot) {
  console.error("usage: node tools/step2-test.mjs <Players Leaving save> <work folder> [other saves...]");
  process.exit(2);
}
const sha1 = f => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
const TABLES = {
  Player: 1612938518, Team: 3359508968, Recruit: 1873209313, TopSchools: 2332540366,
  TargetSchool: 3843719174, LeavingPlayer: 1418279587,
  TransferLeavingArray: 3884115435, TransferRecruitArray: 1611551904
};

async function diffTables(fileA, fileB) {
  const [a, b] = await Promise.all([openFranchise(fileA), openFranchise(fileB)]);
  const out = {};
  for (const [name, uid] of Object.entries(TABLES)) {
    const ta = a.getTableByUniqueId(uid), tb = b.getTableByUniqueId(uid);
    await Promise.all([ta.readRecords(), tb.readRecords()]);
    const changed = [];
    for (let i = 0; i < Math.max(ta.records.length, tb.records.length); i++) {
      const ra = ta.records[i], rb = tb.records[i];
      if (!ra || !rb) { changed.push({ row: i, fields: ["<record missing>"] }); continue; }
      if (ra.isEmpty !== rb.isEmpty) { changed.push({ row: i, fields: ["<empty flag>"] }); continue; }
      if (ra.isEmpty) continue;
      const fields = Object.keys(ra.fields).filter(k => String(ra[k]) !== String(rb[k]))
        .map(k => `${k}: ${ra[k]} -> ${rb[k]}`);
      if (fields.length) changed.push({ row: i, player: name === "LeavingPlayer" ? String(rb.Player) : undefined, fields });
    }
    out[name] = changed;
  }
  return { tables: out, playerRef: idx => a.getTableByUniqueId(TABLES.Player).getBinaryReferenceToRecord(idx) };
}

const workDir = path.join(workRoot, new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"));
fs.mkdirSync(workDir, { recursive: true });
const work = path.join(workDir, path.basename(src));
const srcHash = sha1(src);
fs.copyFileSync(src, work, fs.constants.COPYFILE_EXCL);
console.log(`Work copy: ${work}\n`);

// 1. Open + preview
const session = new Session();
const info = await session.open(work);
console.log(`Stage: ${info.stage.label} | your team: ${info.userTeam?.name} #${info.userTeam?.teamIndex}`);
const plan = session.previewDraftLock();
console.log(`Preview: lock ${plan.toLock.length} at ${plan.byTeam.length} teams | graduating (leave) ${plan.graduating.length} | your team untouched ${plan.userTeam.length} | already staying ${plan.alreadyStaying.length} | also entering portal ${plan.alsoEnteringPortal}`);
console.log(`Locked by year: ${JSON.stringify(plan.toLock.reduce((t, p) => (t[p.schoolYear] = (t[p.schoolYear] || 0) + 1, t), {}))}`);
console.log(`Your team: ${plan.userTeam.map(p => `${p.name} ${p.position} ${p.overall} ${p.schoolYear}`).join(", ")}; graduating from your team: ${plan.graduating.filter(p => p.teamIndex === info.userTeam?.teamIndex).map(p => `${p.name} ${p.position} ${p.overall}`).join(", ")}`);
console.log(`Most locked: ${plan.byTeam.slice(0, 10).map(t => `${t.team} ${t.count}`).join(", ")}`);
console.log("Top 15 locked by OVR:");
for (const p of plan.toLock.slice(0, 15)) console.log(`  ${String(p.overall).padStart(2)} ${p.position.padEnd(4)} ${p.name.padEnd(24)} ${p.schoolYear.padEnd(9)} ${p.team.padEnd(16)} rd ${p.projectedRound}${p.alsoEnteringPortal ? "  (also entering portal)" : ""}`);
const ohioState = plan.toLock.filter(p => p.team === "Ohio State");
console.log(`Ohio State locked: ${ohioState.map(p => `${p.name} ${p.position} ${p.overall} ${p.schoolYear}`).join(", ") || "none"}`);

// 2. Apply + save
const applied = session.applyDraftLock();
console.log(`\nApply: ${applied.locked.length} locked, verified=${applied.verified}${applied.problems.length ? ` problems: ${applied.problems.join("; ")}` : ""}`);
const saved = await session.save();
console.log(`Save: ${saved.saveMs} ms, verified "${saved.check.stage}" / ${saved.check.playerCount} players`);
console.log(`Backup: ${saved.backup.backupPath}`);
console.log(`Draft Lock record: ${saved.draftLockRecord}`);

// 3. Diff saved file against its backup
const { tables, playerRef } = await diffTables(saved.backup.backupPath, work);
const lockedRefs = new Set(applied.locked.map(p => playerRef(p.recordIndex)));
const leaving = tables.LeavingPlayer;
const fieldNames = new Set(leaving.flatMap(c => c.fields.map(f => f.split(":")[0])));
const leavingOnlyLocked = leaving.every(c => lockedRefs.has(c.player));
const touchedPlayers = new Set(leaving.map(c => c.player));
console.log(`\nDiff vs backup:`);
for (const [name, changed] of Object.entries(tables)) console.log(`  ${name.padEnd(21)} ${changed.length} records changed`);
console.log(`  LeavingPlayer fields changed: ${[...fieldNames].join(", ")}`);
console.log(`  Changed draft rows belong only to locked players: ${leavingOnlyLocked}; locked players touched: ${touchedPlayers.size}/${lockedRefs.size}`);
console.log(`  Sample: ${leaving.slice(0, 2).map(c => c.fields.join(", ")).join(" | ")}`);

// 4. Reopen the saved copy
const check = new Session();
const reopened = await check.open(work);
console.log(`\nReopened: ${reopened.stage.label}; underclassmen still set to leave: ${reopened.draftCheck.underclassmenLeaving}; already staying: ${reopened.draftCheck.alreadyStaying}; graduating leaving: ${reopened.draftCheck.graduatingLeaving}; your team leaving: ${reopened.draftCheck.userTeamLeaving}`);
console.log(`Source save untouched: ${sha1(src) === srcHash}`);

// 5. Readout on other saves (read-only)
if (others.length) console.log("\nUnderclassmen-set-to-leave readout on other saves:");
for (const f of others) {
  const s = new Session();
  const r = await s.open(f);
  console.log(`  ${path.basename(f).padEnd(32)} ${r.stage.label.padEnd(28)} underclassmen leaving ${r.draftCheck.underclassmenLeaving} | already staying ${r.draftCheck.alreadyStaying} | graduating ${r.draftCheck.graduatingLeaving}`);
}

const otherTablesClean = Object.entries(tables).every(([n, c]) => n === "LeavingPlayer" || c.length === 0);
const pass = applied.verified && otherTablesClean && leavingOnlyLocked && touchedPlayers.size === lockedRefs.size &&
  [...fieldNames].every(f => f === "LeaveStatus" || f === "PersuadeAttempts") && reopened.draftCheck.underclassmenLeaving === 0;
console.log(`\n${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
