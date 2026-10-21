// Tom's Transfer Tools: run this stage's step on a save copy, show the plan, ask before saving.
//   node ttt.mjs "<save copy>"
import path from "node:path";
import readline from "node:readline/promises";
import { Session } from "./lib/session.mjs";
import { loadSettings } from "./lib/settings.mjs";

const file = process.argv[2];
if (!file) throw new Error('Usage: node ttt.mjs "<save copy>"');
if (path.resolve(file).split(path.sep).includes("test_saves")) throw new Error("Refusing to write into test_saves/; copy the save first.");
if (!loadSettings().userTeam) { console.log('settings.json has no userTeam: add your team, e.g. "userTeam": "<school name>". Nothing was opened.'); process.exit(1); }

const session = new Session();
const info = await session.open(file);
console.log(`${info.fileName} · ${info.stage.label} · user team ${info.userTeam?.name ?? "none"}`);

const top10 = moves => {
  console.log("Top 10 moves by OVR:");
  for (const e of [...moves].sort((a, b) => b.overall - a.overall).slice(0, 10))
    console.log(`  ${e.name.padEnd(24)} ${e.position.padEnd(4)} ${String(e.overall).padStart(3)}  ${e.from} → ${e.team}`);
};

const id = info.stage.id;
if (/^week-/.test(id)) {
  console.log("Portal-week mode was removed (PLAN.md §5); nothing was changed.");
  process.exit(1);
} else if (id === "signing-day") {
  const r = await session.applySigningDay();
  const pb = r.plan.placement;
  console.log(`un-sign ${r.plan.unsign.length} · place ${pb.placed.length} of ${pb.transfers} (unplaced ${pb.unplaced.length})`);
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
