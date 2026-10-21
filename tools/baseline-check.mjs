// Baseline check: the minimum proof for a change (CLAUDE.md), in one command.
//   node tools/baseline-check.mjs [--save]
// Copies test_saves/DYNASTY-SIGNINGDAYCOPY to test_runs/baseline-check/, opens it with
// settings.json → testSavesTeam and no undos, and compares the plan's summary with the
// baseline (PLAN.md §4.6). Prints the card's status, move and why line for four named players.
// --save also applies the plan and saves the copy (backup, write, reopen check).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../lib/session.mjs";
import { emptyState, rawPlan, buildPlan, playerCard } from "../lib/gui-plan.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAVE = "DYNASTY-SIGNINGDAYCOPY";
const BASELINE = { placed: 1310, dropped: 0, unsigned: 2217, deleted: 15, moved: 136 };
const PLAYERS = { 13851: "Jesse Legree", 6934: "Mario Wofford", 3498: "Caden Madha", 13344: "Jackson Hancock" };

const work = path.join(ROOT, "test_runs", "baseline-check");
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const file = path.join(work, SAVE);
fs.copyFileSync(path.join(ROOT, "test_saves", SAVE), file);

const session = new Session();
await session.open(file);
const state = emptyState();
const raw = rawPlan(session, state);
const summary = buildPlan(session, raw, state).summary;
const off = Object.keys(BASELINE).filter(k => summary[k] !== BASELINE[k]);
console.log(`Summary ${off.length ? "DIFFERS" : "matches the baseline"}: ${JSON.stringify(summary)}`);
for (const k of off) console.log(`  ${k}: ${summary[k]}, baseline ${BASELINE[k]}`);

for (const [index, name] of Object.entries(PLAYERS)) {
  const c = playerCard(session, raw, state, Number(index));
  if (!c || c.name !== name) { console.log(`${name} (${index}): MISSING`); continue; }
  console.log(`${name}: ${c.status} ${c.from?.name ?? "—"} → ${c.to?.name ?? "—"}${c.role ? ` (${c.role})` : ""}. ${c.why}`);
}

let saved = true;
if (process.argv.includes("--save")) {
  const applied = await session.applySigningDay({ keep: state.keep, notAt: state.notAt });
  saved = applied.ok;
  if (!applied.ok) console.log(`Apply FAILED:\n  ${applied.failed.join("\n  ")}`);
  else {
    const r = await session.save();
    console.log(`Saved the copy; backup ${path.basename(r.backup.backupPath)}`);
  }
}
process.exit(off.length || !saved ? 1 : 0);
