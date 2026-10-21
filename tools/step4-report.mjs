// Step 4 report: which teams would want a player (team-side fit), read-only.
//   node tools/step4-report.mjs <save> [--who="Player Name"]... [--at=Team,Team] [--top=12] [--league] [--verify]
// --league: interest spread across all uncommitted transfers. --verify: checks the fast
// role calculation against the depth chart's roleAtTeam for every transfer at every team.
import { Session } from "../lib/session.mjs";
import { roleAtTeam } from "../lib/depth-chart.mjs";
import { fitAt } from "../lib/fit.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const opt = n => args.filter(a => a.startsWith(`--${n}=`)).map(a => a.slice(n.length + 3));
const flag = n => args.includes(`--${n}`);
const topN = Number(opt("top")[0] || 12);

const session = new Session();
const info = await session.open(file);
const league = session.getLeague();
const d = session.d;
console.log(`${info.fileName}: ${info.stage.label} | open ${info.openMs} ms | projection ${league.ms} ms`);

const portal = d.players.filter(p => p.isTransfer && !p.transferCommitted);
const describe = t => [
  `${String(t.score).padStart(3)}`, t.team.padEnd(18), `${t.role}${t.pathToStart ? "+path" : ""}`.padEnd(13),
  `#${t.rank}`.padEnd(4), `${t.need === "Drop-off" ? `drop-off ${t.dropOff}` : t.need === "Weak" ? `weak ${t.weakness}` : t.need === "Upgrade" ? `upgrade+${t.upgrade}→${t.weightedUpgrade}` : t.need} ×${t.needMult}`.padEnd(20),
  `upgrade ${t.upgrade >= 0 ? "+" : ""}${t.upgrade}`.padEnd(12),
  `weakest starter ${t.weakestStarter ?? "-"}`.padEnd(19),
  [t.levelOk ? "" : "ceiling too low", t.oldTeam ? "his old team" : "", t.serviceAcademy ? "service academy" : ""].filter(Boolean).join(", ")
].join(" ");

for (const name of opt("who")) {
  const matches = d.players.filter(p => p.name.toLowerCase() === name.toLowerCase());
  const p = matches.find(x => x.isTransfer) || matches[0];
  if (!p) { console.log(`\n${name}: not found`); continue; }
  const started = performance.now();
  const w = session.whoWantsHim(p.index);
  const ms = (performance.now() - started).toFixed(1);
  console.log(`\n=== ${w.player} · ${w.position} ${w.overall} (max ${w.max}, ${w.dev}) · next year ${w.year} · from ${w.from}${w.committedTo ? ` · committed to ${w.committedTo}` : " · uncommitted"}`);
  console.log(`    ${w.interested} of ${w.teams.length} teams interested (${ms} ms)`);
  w.teams.slice(0, topN).forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${describe(t)}`));
  const atTeams = (opt("at")[0] || "").split(",").filter(Boolean).map(n => d.findTeamByName(n)?.index);
  for (const extra of new Set([p.prevTeam, p.destination, ...atTeams])) {
    const i = w.teams.findIndex(t => t.teamIndex === extra);
    if (i >= topN) console.log(`  ${String(i + 1).padStart(2)}. ${describe(w.teams[i])}`);
  }
}

if (flag("league")) {
  const started = performance.now();
  const counts = portal.map(p => {
    const w = session.whoWantsHim(p.index);
    return { p, interested: w.interested, best: w.teams[0] };
  });
  const ms = performance.now() - started;
  console.log(`\nLeague: ${portal.length} uncommitted transfers scored at ${league.teams.size} teams in ${ms.toFixed(0)} ms`);
  const buckets = [[0, 0], [1, 5], [6, 20], [21, 50], [51, 999]];
  console.log("  Teams interested per player: " + buckets.map(([a, b]) => `${a === b ? a : b > 900 ? `${a}+` : `${a}-${b}`}: ${counts.filter(c => c.interested >= a && c.interested <= b).length}`).join(" | "));
  const none = counts.filter(c => c.interested === 0).sort((a, b) => b.p.overall - a.p.overall);
  console.log(`  Nobody interested (${none.length}), best first:`);
  for (const c of none.slice(0, 15)) console.log(`    ${c.p.name} ${c.p.position} ${c.p.overall} (max ${d.maxOverall(c.p)}) ${c.p.schoolYear}, from ${d.teamName(c.p.prevTeam)}`);
  const status = {};
  for (const proj of league.teams.values()) for (const n of Object.values(proj._needs || {})) status[n.status] = (status[n.status] || 0) + 1;
  console.log(`  Room needs across the league: ${JSON.stringify(status)}`);
  const topPicks = new Map();
  for (const c of counts) if (c.best?.score > 0) topPicks.set(c.best.team, (topPicks.get(c.best.team) || 0) + 1);
  console.log(`  Most frequent best fit (before any balancing): ${[...topPicks].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `${t} ${n}`).join(", ")}`);
}

if (flag("verify")) {
  let checked = 0, bad = 0;
  for (const p of portal) for (const t of league.teams.keys()) {
    const fast = fitAt(d, league, p, t, session.settings);
    if (!fast) continue;
    const slow = roleAtTeam(d, league, p.index, t, session.settings);
    checked++;
    if (fast.rawRole !== slow.role || fast.rank !== slow.rank || (!fast.stopgap && fast.pathToStart !== slow.pathToStart)) {
      if (bad++ < 5) console.log(`  MISMATCH ${p.name} @ ${slow.team}: fast ${fast.role}#${fast.rank}${fast.pathToStart ? "+path" : ""} vs depth chart ${slow.role}#${slow.rank}${slow.pathToStart ? "+path" : ""}`);
    }
  }
  console.log(`\nVerify: ${checked} player-team roles checked against the depth chart, ${bad} mismatches`);
}
