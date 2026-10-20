// Weekly commits (task 2): plan this week's commits and write them to the save (backup first,
// verified on reopen). Never point it at test_saves/ or a real save you haven't copied.
//   node tools/weekly-run.mjs <Week 1–4 save copy> [--dry]
import path from "node:path";
import { Session } from "../lib/session.mjs";
import { planWeekly } from "../lib/weekly-commits.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
if (!file) throw new Error("Usage: node tools/weekly-run.mjs <save copy> [--dry]");
if (path.resolve(file).split(path.sep).includes("test_saves")) throw new Error("Refusing to write into test_saves/; copy the save first.");

const session = new Session();
const info = await session.open(file);
const d = session.d;
const plan = planWeekly(d, session.getLeague(), session.settings);
if (!plan.available) { console.log(`${info.fileName}: no weekly commits at ${plan.stage}`); process.exit(0); }
console.log(`${info.fileName}: ${plan.stage} · pace ${plan.pace * 100}% = ${plan.target} · game commits ${plan.gameCommits} · tool commits ${plan.commits.length}`);
if (args.includes("--dry") || !plan.commits.length) process.exit(0);

const edits = session.edits();
for (const e of plan.commits) edits.commitTransfer(d.playerByIndex.get(e.index), e.teamIndex, { weekly: true });
const r = await session.save();
console.log(`saved ${r.saveMs} ms · ${r.changes.join(" · ")} · backup ${r.backup.backupPath}`);
