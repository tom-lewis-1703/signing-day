// Step 4b report: player side + combined Top 10 preview, read-only.
//   node tools/step4b-report.mjs <save> [--who="Player Name"]... [--at=Team,Team] [--league]
// --league: spread of #1 choices, prestige of #1 choices by OVR band, empty Top 10s, and
// (on saves with game commits) how often a committed transfer's school is in our Top 10.
import { Session } from "../lib/session.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const opt = n => args.filter(a => a.startsWith(`--${n}=`)).map(a => a.slice(n.length + 3));
const flag = n => args.includes(`--${n}`);

const session = new Session();
const info = await session.open(file);
const league = session.getLeague();
const d = session.d;
console.log(`${info.fileName}: ${info.stage.label} | open ${info.openMs} ms | projection ${league.ms} ms`);

const row = (t, i) => [
  `${String(i).padStart(3)}.`, t.team.padEnd(16), `P${t.prestigeLevel}`.padEnd(4),
  `comb ${String(t.combined).padStart(3)}`, `| player ${String(t.playerScore).padStart(3)}`, `team ${String(t.score).padStart(3)}`,
  `| ${t.role}${t.pathToStart ? "+path" : ""}`.padEnd(16),
  `db ${t.dealbreakerGrade ?? t.parts.dealbreakerValue}${t.meets ? "" : "✗"}`.padEnd(10), `pitch ${(t.pitchGrades || []).join("/")}`.padEnd(22), `pres ${t.parts.prestige}`.padEnd(8), `str ${t.parts.teamStrength}`.padEnd(7), t.parts.home ? "home" : "    ",
  [t.userTeam ? "your team" : "", t.joinedByPerk ? "joined by coach perk" : t.userTeam && t.perkReach ? "coach perk" : "", !t.meets ? "fails dealbreaker" : "", !t.allowed ? "below prestige floor" : "", !t.wantsHim ? "team not interested" : "", t.oldTeam ? "old team" : ""].filter(Boolean).join(", ")
].join(" ");

for (const name of opt("who")) {
  const matches = d.players.filter(p => p.name.toLowerCase() === name.toLowerCase());
  const p = matches.find(x => x.isTransfer) || matches[0];
  if (!p) { console.log(`\n${name}: not found`); continue; }
  const r = session.destinations(p.index);
  console.log(`\n=== ${r.player} · ${r.position} ${r.overall} (max ${r.max}, ${r.dev}, ${r.archetype}) · next year ${r.year} · from ${r.from} · home ${r.homeState} · dealbreaker ${r.dealbreaker} · pitch ${r.pitch} (+${r.secondaries.join(", ")})`);
  console.log(`    dealbreaker bar: ${r.dealbreakerBar ?? "-"} · floor: ${r.floor} · ${r.eligible} teams pass both sides${r.committedTo ? ` · committed to ${r.committedTo}` : ""}`);
  r.top10.forEach((t, i) => console.log(row(t, i + 1)));
  const at = new Set((opt("at")[0] || "").split(",").filter(Boolean).map(n => d.findTeamByName(n)?.index));
  if (p.prevTeam !== undefined) at.add(p.prevTeam);
  if (p.destination !== null) at.add(p.destination);
  r.teams.forEach((t, i) => { if (at.has(t.teamIndex) && !r.top10.includes(t)) console.log(row(t, i + 1)); });
}

if (flag("league")) {
  const started = performance.now();
  const portal = d.players.filter(p => p.isTransfer && !p.transferCommitted);
  const results = portal.map(p => ({ p, r: session.destinations(p.index) }));
  console.log(`\nLeague: ${portal.length} uncommitted transfers in ${(performance.now() - started).toFixed(0)} ms`);
  const empty = results.filter(x => !x.r.top10.length);
  console.log(`  Empty Top 10: ${empty.length}${empty.length ? " — " + empty.slice(0, 10).map(x => `${x.p.name} ${x.p.position} ${x.p.overall}`).join(", ") : ""}`);
  const short = results.filter(x => x.r.top10.length && x.r.top10.length < 10).length;
  console.log(`  Fewer than 10 schools: ${short}`);
  const firsts = new Map();
  for (const x of results) if (x.r.top10[0]) firsts.set(x.r.top10[0].team, (firsts.get(x.r.top10[0].team) || 0) + 1);
  const fs = [...firsts].sort((a, b) => b[1] - a[1]);
  console.log(`  #1 choice spread: ${fs.length} teams are someone's #1; most: ${fs.slice(0, 10).map(([t, n]) => `${t} ${n}`).join(", ")}`);
  for (const [lo, hi] of [[90, 99], [85, 89], [80, 84], [75, 79], [0, 74]]) {
    const band = results.filter(x => x.p.overall >= lo && x.p.overall <= hi && x.r.top10[0]);
    if (!band.length) continue;
    const pres = band.map(x => x.r.top10[0].prestigeLevel);
    const fallback = band.filter(x => /fallback/.test(x.r.floor)).length;
    console.log(`  ${lo}-${hi} OVR (${band.length}): #1 choice prestige avg ${(pres.reduce((a, b) => a + b, 0) / pres.length).toFixed(1)}, min ${Math.min(...pres)}, at <=3: ${pres.filter(x => x <= 3).length}${fallback ? `, fallback floor used: ${fallback}` : ""}`);
  }
  const userIn = results.filter(x => x.r.top10.some(t => t.userTeam));
  const joined = userIn.filter(x => x.r.top10.some(t => t.joinedByPerk)).length;
  console.log(`  ${session.settings.userTeam} in ${userIn.length} Top 10s (${(userIn.length / results.length * 100).toFixed(1)}%), ${joined} of them joined by coach perk, top 2 in ${userIn.filter(x => x.r.top10.slice(0, 2).some(t => t.userTeam)).length}`);
  // Compare against the game's own commits on this save (committed transfers).
  const committed = d.players.filter(p => p.transferCommitted);
  if (committed.length) {
    let in10 = 0, first = 0;
    for (const p of committed) {
      const r = session.destinations(p.index);
      const i = r.top10.findIndex(t => t.teamIndex === p.destination);
      if (i >= 0) in10++;
      if (i === 0) first++;
    }
    console.log(`  Game's own commits (${committed.length}): destination in our Top 10 for ${in10} (${Math.round(in10 / committed.length * 100)}%), our #1 for ${first}`);
  }
}
