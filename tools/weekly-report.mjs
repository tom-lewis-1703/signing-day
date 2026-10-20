// Weekly commits preview (task 2), read-only.
//   node tools/weekly-report.mjs <Week 1–4 save> [--compare] [--show=N]
// --compare: the three priority orders side by side (clear favorite / ranked high / mix).
import { Session } from "../lib/session.mjs";
import { planWeekly } from "../lib/weekly-commits.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const show = Number((args.find(a => a.startsWith("--show=")) || "=15").split("=")[1]);

const session = new Session();
const info = await session.open(file);
const d = session.d;
const league = session.getLeague();
console.log(`${info.fileName}: ${info.stage.label}`);

const variants = args.includes("--compare")
  ? [["Clear favorite", { favorite: 1, rank: 0, offer: 0 }], ["Ranked high", { favorite: 0, rank: 1, offer: 0 }], ["Mix", session.settings.weekly.weights]]
  : [["Settings", session.settings.weekly.weights]];
const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : "-";
const sets = [];
for (const [label, w] of variants) {
  const r = planWeekly(d, league, session.settings, w);
  if (!r.available) { console.log(`no weekly commits at ${r.stage}`); break; }
  const c = r.commits;
  sets.push(new Set(c.map(e => e.index)));
  const band = (lo, hi) => c.filter(e => e.overall >= lo && e.overall < hi).length;
  const star = n => c.filter(e => e.stars === n).length;
  console.log(`\n=== ${label} (favorite ${w.favorite}, rank ${w.rank}, offer ${w.offer}) · ${r.ms} ms`);
  console.log(`pace ${r.pace * 100}% of ${r.transfers} = ${r.target} · game commits ${r.gameCommits} · tool commits ${c.length} of ${r.quota} · candidates ${r.candidates} · skipped: on user board ${r.userBoard}, user team in top 3 ${r.userTop3} · no room ${r.noRoom.length}`);
  console.log(`OVR 85+ ${band(85, 200)} · 80–84 ${band(80, 85)} · 75–79 ${band(75, 80)} · 70–74 ${band(70, 75)} · under 70 ${band(0, 70)} | stars 5★ ${star(5)} 4★ ${star(4)} 3★ ${star(3)} 2★ ${star(2)} 1★ ${star(1)}`);
  const avgP = (lo, hi) => { const x = c.filter(e => e.overall >= lo && e.overall < hi); return x.length ? (x.reduce((a, e) => a + d.teams.get(e.teamIndex).prestige, 0) / x.length).toFixed(1) : "-"; };
  console.log(`roles Starter ${c.filter(e => e.role === "Starter").length} · Rotation ${c.filter(e => e.role === "Rotation").length} · other ${c.filter(e => !["Starter", "Rotation"].includes(e.role)).length} | avg prestige 85+ ${avgP(85, 200)} · 80–84 ${avgP(80, 85)} · 75–79 ${avgP(75, 80)} · under 75 ${avgP(0, 75)}`);
  console.log(`went to our #1 ${pct(c.filter(e => e.topIndex === 0).length, c.length)} · to his in-game #1 ${pct(c.filter(e => e.teamIndex === e.gameNo1).length, c.length)} · to an offering school ${c.filter(e => e.how.startsWith("Offered")).length} · schools getting one ${new Set(c.map(e => e.teamIndex)).size}`);
  for (const e of c.slice(0, show)) {
    console.log(`  ${e.name.padEnd(22)} ${e.position.padEnd(4)} ${String(e.overall).padStart(2)} ${e.stars ?? "-"}★ #${String(e.nationalRank ?? "-").padEnd(5)} ${e.from.padEnd(16)} → ${e.team.padEnd(16)} ${e.how.padEnd(20)} ${e.role.padEnd(8)} lead ${Math.round(e.margin * 100)}%`);
  }
}
if (sets.length === 3) {
  const both = (a, b) => [...a].filter(x => b.has(x)).length;
  console.log(`\nsame players: favorite & ranked ${both(sets[0], sets[1])} · favorite & mix ${both(sets[0], sets[2])} · ranked & mix ${both(sets[1], sets[2])}`);
}
