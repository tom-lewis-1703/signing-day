// Tom's Transfer Tools: run this stage's step on a save copy, show the plan, ask before saving.
//   node ttt.mjs "<save copy>"
import path from "node:path";
import readline from "node:readline/promises";
import { Session } from "./lib/session.mjs";
import { planWeekly, planListUpdates } from "./lib/weekly-commits.mjs";

const file = process.argv[2];
if (!file) throw new Error('Usage: node ttt.mjs "<save copy>"');
if (path.resolve(file).split(path.sep).includes("test_saves")) throw new Error("Refusing to write into test_saves/; copy the save first.");

const session = new Session();
const info = await session.open(file);
const d = session.d;
console.log(`${info.fileName} · ${info.stage.label} · user team ${info.userTeam?.name ?? "none"}`);

const top10 = moves => {
  console.log("Top 10 moves by OVR:");
  for (const e of [...moves].sort((a, b) => b.overall - a.overall).slice(0, 10))
    console.log(`  ${e.name.padEnd(24)} ${e.position.padEnd(4)} ${String(e.overall).padStart(3)}  ${e.from} → ${e.team}`);
};

const id = info.stage.id;
if (/^week-/.test(id)) {
  const plan = planWeekly(d, session.getLeague(), session.settings);
  const lists = planListUpdates(d, session.settings, plan);
  const updates = lists.available ? lists.updates : [];
  console.log(`commits ${plan.commits.length} (game ${plan.gameCommits}) · list updates ${updates.length}`);
  if (!plan.commits.length && !updates.length) process.exit(0);
  top10(plan.commits);
  const edits = session.edits();
  for (const e of plan.commits) edits.commitTransfer(d.playerByIndex.get(e.index), e.teamIndex, { weekly: true });
  for (const u of updates) edits.setTopSchools(d.playerByIndex.get(u.index), u.after);
} else if (id === "signing-day") {
  const r = await session.applySigningDay();
  const pb = r.plan.placement;
  console.log(`un-sign ${r.plan.unsign.length} · sign unsigned commits ${pb.committed.filter(e => e.sign).length} · place ${pb.placed.length} of ${pb.transfers} (unplaced ${pb.unplaced.length})`);
  const recruits = pb.cuts.filter(e => e.kind === "Recruit").length;
  console.log(`make room: un-sign ${recruits} recruits, move ${pb.moved.length}, cut ${pb.cuts.length - recruits - pb.moved.length}`);
  if (!r.ok) {
    console.log(`NOT SAVED: ${r.failed.length} edits failed`);
    for (const f of r.failed) console.log(`  ${f}`);
    process.exit(1);
  }
  top10([...pb.placed, ...pb.moved]);
} else {
  console.log("No action at this stage.");
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question("Save? y/n ")).trim().toLowerCase();
rl.close();
if (answer !== "y") { console.log("Not saved."); process.exit(0); }
const s = await session.save();
console.log(`Saved (${s.saveMs} ms) · ${s.changes.join(" · ")} · backup ${s.backup.backupPath}`);
