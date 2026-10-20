// After advancing: are the locked players still on their teams?
//   node tools/step2-check.mjs <...draft-lock.json> <later save>
// Players are matched by first name, last name and team, since record numbers can change.
import fs from "node:fs";
import path from "node:path";
import { Session } from "../lib/session.mjs";

const [recordPath, laterSave] = process.argv.slice(2);
if (!recordPath || !laterSave) {
  console.error("usage: node tools/step2-check.mjs <draft-lock.json> <later save>");
  process.exit(2);
}
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
const session = new Session();
const info = await session.open(laterSave);
const d = session.d;

const byName = new Map();
for (const p of d.players) {
  if (!byName.has(p.name)) byName.set(p.name, []);
  byName.get(p.name).push(p);
}

function fate(p) {
  const matches = byName.get(p.name) || [];
  if (matches.some(m => m.team === p.teamIndex)) return "on his team";
  const elsewhere = matches.find(m => d.teams.has(m.team));
  if (elsewhere) return `at ${d.teamName(elsewhere.team)}`;
  return matches.length ? "no team" : "gone (left the save)";
}

const tally = list => list.reduce((t, p) => { const f = fate(p); const k = f.startsWith("at ") ? "at another team" : f; t[k] = (t[k] || 0) + 1; return t; }, {});
console.log(`Later save: ${path.basename(laterSave)} (${info.stage.label})`);
console.log(`Locked players (${record.locked.length}):`, tally(record.locked));
console.log(`Graduating early-draft players (${record.graduating.length}):`, tally(record.graduating));
console.log(`Your team's early-draft players:`, record.userTeamPlayers.map(p => `${p.name}: ${fate(p)}`).join(", ") || "none");
const notHome = record.locked.filter(p => fate(p) !== "on his team");
if (notHome.length) {
  console.log("Locked players not on their team:");
  for (const p of notHome) console.log(`  ${p.name} ${p.position} ${p.overall} ${p.team} -> ${fate(p)}${p.alsoEnteringPortal ? " (was entering the portal)" : ""}`);
}
