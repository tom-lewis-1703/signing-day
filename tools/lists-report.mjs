// Weekly interest update preview (task 2), read-only: each uncommitted transfer's in-game list
// after this week's commits.   node tools/lists-report.mjs <Week 2–4 save> [--who="Name"]...
import { Session } from "../lib/session.mjs";
import { planWeekly, planListUpdates } from "../lib/weekly-commits.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const who = args.filter(a => a.startsWith("--who=")).map(a => a.slice(6).toLowerCase());

const session = new Session();
const info = await session.open(file);
const d = session.d;
const weekly = planWeekly(d, session.getLeague(), session.settings);
const r = planListUpdates(d, session.settings, weekly);
if (!r.available) { console.log(`${info.fileName}: no list update at ${r.stage}`); process.exit(0); }
const u = r.updates;
const avg = k => (u.reduce((a, x) => a + x[k], 0) / Math.max(u.length, 1)).toFixed(1);
console.log(`${info.fileName}: ${d.stage.label} · after ${weekly.commits.length} commits · lists changed ${u.length} · unchanged ${r.unchanged} · on user team's board (left alone) ${r.userBoard}`);
console.log(`per changed list: schools replaced ${avg("replaced")} · kept (user team / on a board) ${avg("kept")} · new #1 ${u.filter(x => x.after[0].teamIndex !== x.before[0].teamIndex).length}`);
const fmt = l => l.map(x => `${d.teamName(x.teamIndex)} ${x.influence}`).join(", ");
for (const x of u.filter(x => who.includes(x.name.toLowerCase()))) {
  console.log(`\n${x.name} ${x.position} ${x.overall}\n  before: ${fmt(x.before)}\n  after:  ${fmt(x.after)}`);
}
