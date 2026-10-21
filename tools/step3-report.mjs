// Step 3 report: projected depth charts from a save (read-only).
//   node tools/step3-report.mjs <save> [--teams=Ohio State,Kansas] [--rooms=QB,WR] [--role="Player Name@Team"]... [--league=N]
import { Session } from "../lib/session.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const opt = n => args.filter(a => a.startsWith(`--${n}=`)).map(a => a.slice(n.length + 3));
const session = new Session();
const info = await session.open(file);
const t = session.depthTeams();
console.log(`${info.fileName}: ${info.stage.label} | open ${info.openMs} ms | projection of ${t.teams.length} teams ${t.ms} ms`);

const byName = new Map(t.teams.map(x => [x.name, x.teamIndex]));
const onlyRooms = opt("rooms")[0]?.split(",");
for (const name of (opt("teams")[0] || "").split(",").filter(Boolean)) {
  const team = session.depthTeam(byName.get(name));
  console.log(`\n=== ${team.team}  (${team.offScheme} / ${team.defScheme}) next-season roster ${team.rosterNextSeason} | starters lost ${team.startersLost}, replaced ${team.startersFilled}, open ${team.openSlots}`);
  for (const room of team.roomOrder) {
    if (onlyRooms && !onlyRooms.includes(room)) continue;
    const list = team.rooms[room], n = team.needs[room];
    if (!list.length && !n) continue;
    console.log(`  ${room} (${team.starters[room] ?? 0} starters)`);
    for (const e of list.slice(0, 8)) console.log(`    ${e.role.padEnd(8)} ${String(e.overall).padStart(2)}→${String(e.max).padStart(2)} ${e.name.padEnd(24)} ${e.position.padEnd(4)} ${e.year.padEnd(9)} ${[...e.tags, e.pathToStart ? "Path to start" : ""].filter(Boolean).join(" · ")}`);
    if (list.length > 8) console.log(`    … ${list.length - 8} more (Buried)`);
    if (n?.lost.length) console.log(`    lost: ${n.lost.map(l => `${l.name} ${l.overall} (${l.reason})`).join(", ")}`);
    if (n?.filledByIncoming.length) console.log(`    replaced by: ${n.filledByIncoming.map(f => `${f.name} ${f.overall}`).join(", ")}`);
  }
}

const portal = session.portalPlayers();
for (const spec of opt("role")) {
  const [player, teamName] = spec.split("@");
  const p = portal.find(x => x.label.startsWith(player));
  if (!p) { console.log(`\n${player}: not an uncommitted transfer on this save`); continue; }
  const r = session.roleAt(p.index, byName.get(teamName));
  console.log(`\n${p.label}\n  at ${r.team}: ${r.role} (#${r.rank} ${r.room}, ${r.starters} starters)${r.pathToStart ? ", path to start the year after" : ""}; ahead: ${r.ahead.map(a => `${a.name} ${a.overall} ${a.year}`).join(", ") || "nobody"}`);
}

const top = Number(opt("league")[0] || 0);
if (top) {
  const rows = session.leagueSummary();
  const roles = { Starter: 0, Rotation: 0, Backup: 0, Buried: 0 };
  for (const team of session.getLeague().teams.values()) for (const list of Object.values(team.rooms)) for (const e of list) roles[e.role]++;
  console.log(`\nLeague: ${rows.length} teams | total starters lost ${rows.reduce((s, r) => s + r.startersLost, 0)}, replaced ${rows.reduce((s, r) => s + r.startersFilled, 0)}, open ${rows.reduce((s, r) => s + r.openSlots, 0)} | roles ${JSON.stringify(roles)}`);
  console.log(`Most open starter slots:`);
  for (const r of rows.slice(0, top)) console.log(`  ${r.team.padEnd(18)} open ${String(r.openSlots).padStart(2)} (lost ${r.startersLost}, replaced ${r.startersFilled}) ${r.openRooms.join(", ")}`);
  console.log(`Fewest open:`);
  for (const r of rows.slice(-Math.min(top, 5))) console.log(`  ${r.team.padEnd(18)} open ${String(r.openSlots).padStart(2)} (lost ${r.startersLost}, replaced ${r.startersFilled})`);
}
