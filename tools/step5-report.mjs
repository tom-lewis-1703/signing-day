// Step 5 report: Signing Day recruit cleanup preview, read-only.
//   node tools/step5-report.mjs <Signing Day save> [--team=Name]... [--teams=N]
// League totals (un-signed / kept by dev trait and position), board slots freed per team
// (35 per team), the N teams with the most un-signed recruits (default 10), and every
// un-signed or kept recruit at each --team.
import { Session } from "../lib/session.mjs";
import { planRecruitCleanup, BOARD_SLOTS } from "../lib/signing-day.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const opt = n => args.filter(a => a.startsWith(`--${n}=`)).map(a => a.slice(n.length + 3));

const session = new Session();
const info = await session.open(file);
const league = session.getLeague();
const d = session.d;
console.log(`${info.fileName}: ${info.stage.label} | open ${info.openMs} ms | projection ${league.ms} ms`);
if (info.stage.id !== "signing-day") console.log("Note: not a Signing Day save; the cleanup only runs at Signing Day.");

const started = performance.now();
const plan = planRecruitCleanup(d, league, session.settings);
const ms = (performance.now() - started).toFixed(0);
const count = (list, f) => list.reduce((m, e) => { const k = f(e); m[k] = (m[k] || 0) + 1; return m; }, {});
const fmt = m => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
const signed = plan.teams.reduce((a, t) => a + t.signed, 0);
const under = plan.unsign.length + plan.kept.length;

console.log(`\nRecruit cleanup (${ms} ms): ${plan.teams.length} CPU teams (${session.settings.userTeam} skipped), ${signed} signed HS/JUCO recruits, ${under} under ${plan.underOverall}`);
console.log(`  Un-signed: ${plan.unsign.length} (${fmt(count(plan.unsign, e => e.dev))})`);
console.log(`  Kept:      ${plan.kept.length} (${fmt(count(plan.kept, e => e.dev))}) — ${plan.keepDev.join("/")} with max reaching the average starter`);
console.log(`  Not kept despite ${plan.keepDev.join("/")}: ${plan.unsign.filter(e => plan.keepDev.includes(e.dev)).length} (max below the average starter)`);
console.log(`  Un-signed by position: ${fmt(count(plan.unsign, e => e.room))}`);
console.log(`  Average next-season starter by position: ${Object.entries(plan.avgStarter).map(([r, v]) => `${r} ${v.toFixed(1)}`).join(", ")}`);

const before = plan.teams.reduce((a, t) => a + t.boardBefore, 0), after = plan.teams.reduce((a, t) => a + t.boardAfter, 0);
console.log(`\nBoards (${BOARD_SLOTS} slots per team): ${before} used before, ${after} after; free slots ${plan.teams.length * BOARD_SLOTS - before} -> ${plan.teams.length * BOARD_SLOTS - after}`);
console.log(`  Teams with a full board before: ${plan.teams.filter(t => t.boardBefore >= BOARD_SLOTS).length}, after: ${plan.teams.filter(t => t.boardAfter >= BOARD_SLOTS).length}`);
const offBoard = plan.unsign.filter(e => !e.onBoard).length;
if (offBoard) console.log(`  Un-signed recruits not on a board (committed by Top School #1 only): ${offBoard}`);

const n = Number(opt("teams")[0] || 10);
console.log(`\nTeams with the most un-signed recruits (top ${n}):`);
for (const t of [...plan.teams].sort((a, b) => b.unsign.length - a.unsign.length || a.team.localeCompare(b.team)).slice(0, n)) {
  console.log(`  ${t.team.padEnd(16)} signed ${String(t.signed).padStart(2)} | un-signed ${String(t.unsign.length).padStart(2)} | kept ${t.kept.length} | board ${t.boardBefore} -> ${t.boardAfter} (${t.boardFree} free)`);
}

const line = e => `${e.name} ${e.position} ${e.overall} (max ${e.max}, ${e.dev}${e.recruitClass.startsWith("JuniorCollege") ? ", JUCO" : ""})`;
for (const name of opt("team")) {
  const t = plan.teams.find(x => x.team.toLowerCase() === name.toLowerCase());
  if (!t) { console.log(`\n${name}: not found (or the user team)`); continue; }
  console.log(`\n=== ${t.team}: ${t.signed} signed recruits, board ${t.boardBefore} -> ${t.boardAfter} (${t.boardFree} free)`);
  console.log(`  Un-signed (${t.unsign.length}): ${t.unsign.sort((a, b) => b.overall - a.overall).map(line).join("; ") || "none"}`);
  console.log(`  Kept under ${plan.underOverall} (${t.kept.length}): ${t.kept.map(e => `${line(e)} vs avg ${e.room} starter ${e.avgStarter}`).join("; ") || "none"}`);
}
