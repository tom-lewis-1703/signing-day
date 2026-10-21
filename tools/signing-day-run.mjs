// Signing Day write (task 4): build the Signing Day plan and write it to the save (backup
// first, verified on reopen). All or nothing: if any edit fails, nothing is saved.
// Never point it at test_saves/ or a real save you haven't copied.
//   node tools/signing-day-run.mjs <Signing Day save copy> [--dry]
import path from "node:path";
import { Session } from "../lib/session.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
if (!file) throw new Error("Usage: node tools/signing-day-run.mjs <save copy> [--dry]");
if (path.resolve(file).split(path.sep).includes("test_saves")) throw new Error("Refusing to write into test_saves/; copy the save first.");

const session = new Session();
const info = await session.open(file);
if (info.stage.id !== "signing-day") { console.log(`${info.fileName}: not a Signing Day save (${info.stage.label})`); process.exit(0); }
const r = await session.applySigningDay();
const pb = r.plan.placement;
console.log(`${info.fileName}: un-sign ${r.plan.unsign.length} · unsigned commits signed ${pb.committed.filter(e => e.sign).length} · transfers placed ${pb.placed.length} of ${pb.transfers} (unplaced ${pb.unplaced.length}) · cuts ${pb.cuts.length} (moved ${pb.moved.length}) · over ${pb.rosterMax}: ${pb.over.length}`);
if (!r.ok) {
  console.log(`NOT SAVED: ${r.failed.length} edits failed`);
  for (const f of r.failed) console.log(`  ${f}`);
  process.exit(1);
}
console.log(r.counts.join(" · "));
if (args.includes("--dry")) process.exit(0);
const s = await session.save();
console.log(`saved ${s.saveMs} ms · backup ${s.backup.backupPath}`);
